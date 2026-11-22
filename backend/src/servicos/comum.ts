import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { pino } from 'pino';
import type { ILogger } from '../application/ports/ILogger.js';
import type { IMensageria } from '../application/ports/IMensageria.js';
import { responderSaude, type Verificacoes } from '../infrastructure/http/saude.js';
import { tratarErro } from '../infrastructure/http/tratadorErros.js';
import { PinoLogger } from '../infrastructure/logging/PinoLogger.js';
import { MensageriaAmqp } from '../infrastructure/mensageria/MensageriaAmqp.js';

export interface ServicoMontado {
    /** Dependências próprias checadas pelo /health (o RabbitMQ já entra automaticamente). */
    verificacoes: Verificacoes;
    /** Informações extras devolvidas pelo /health quando tudo está ok. */
    extrasSaude?: () => Promise<Record<string, unknown>>;
    /** Rotas HTTP de consulta do serviço, além do /health. */
    rotas?: (app: FastifyInstance) => void;
    encerrar: () => Promise<void>;
}

export function criarLogger(servico: string) {
    const pinoLogger = pino({ level: process.env['LOG_LEVEL'] ?? 'info', base: { servico } });
    return { pinoLogger, logger: new PinoLogger(pinoLogger) as ILogger };
}

export function conectarMensageria(logger: ILogger): Promise<MensageriaAmqp> {
    return MensageriaAmqp.conectar({
        // No Docker o host é o nome do container (cinebridge-mq), resolvido pela rede cinebridge-net.
        url: process.env['RABBITMQ_URL'] ?? 'amqp://guest:guest@localhost:5672',
        logger,
        timeoutMs: Number(process.env['RPC_TIMEOUT_MS'] ?? 5_000)
    });
}

/**
 * Sobe um microsserviço consumidor (profissionais, projetos, notificações): conecta no RabbitMQ,
 * monta o serviço (banco + consumidores) e abre a porta HTTP com /health para o Docker.
 */
export function iniciarServico(
    nome: string,
    portaPadrao: number,
    montar: (contexto: { logger: ILogger; mensageria: IMensageria }) => Promise<ServicoMontado>
): void {
    const { pinoLogger, logger } = criarLogger(nome);
    (async () => {
        const mensageria = await conectarMensageria(logger);
        const servico = await montar({ logger, mensageria });

        const app = Fastify({ loggerInstance: pinoLogger as FastifyBaseLogger });
        app.setErrorHandler(tratarErro);
        const verificacoes = { ...servico.verificacoes, mensageria: () => mensageria.verificar() };
        app.get('/health', (_req, resposta) => responderSaude(resposta, verificacoes, servico.extrasSaude));
        servico.rotas?.(app);

        const encerrar = async (): Promise<void> => {
            await app.close();
            await mensageria.encerrar();
            await servico.encerrar();
            process.exit(0);
        };
        process.once('SIGINT', () => void encerrar());
        process.once('SIGTERM', () => void encerrar());

        await app.listen({ port: Number(process.env['PORT'] ?? portaPadrao), host: process.env['HOST'] ?? '0.0.0.0' });
    })().catch((erro: unknown) => {
        logger.error(`Falha ao iniciar ${nome}`, { erro: erro instanceof Error ? erro.message : String(erro) });
        process.exit(1);
    });
}
