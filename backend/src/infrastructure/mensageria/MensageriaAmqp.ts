import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import type { ILogger } from '../../application/ports/ILogger.js';
import type { IMensageria, Pedido } from '../../application/ports/IMensageria.js';
import { abrirResposta, respostaDeErro, type Resposta } from './protocolo.js';

export interface OpcoesAmqp {
    /** Ex.: amqp://guest:guest@cinebridge-mq:5672 (no Docker o host é o nome do container). */
    url: string;
    logger: ILogger;
    /** Tempo máximo de espera de uma resposta de RPC. */
    timeoutMs?: number;
    /** Tentativas de conexão na subida (o broker pode demorar alguns segundos para aceitar conexões). */
    tentativas?: number;
}

const json = (valor: unknown): Buffer => Buffer.from(JSON.stringify(valor ?? null));
const lerJson = (mensagem: ConsumeMessage): unknown => JSON.parse(mensagem.content.toString('utf8'));
/** Roda `tratar` sobre o corpo da mensagem; JSON inválido vira promise rejeitada, não exceção no callback do amqplib. */
const processar = <T>(mensagem: ConsumeMessage, tratar: (corpo: never) => Promise<T>): Promise<T> =>
    Promise.resolve().then(() => tratar(lerJson(mensagem) as never));

/**
 * RabbitMQ via amqplib.
 * - Filas de trabalho duráveis, mensagens persistentes e canal com confirmação do broker (publisher confirms).
 * - Consumidores confirmam (ack) só depois de processar; em erro, a mensagem volta uma vez para a fila.
 * - RPC: uma fila de retorno exclusiva por processo, com nome único (respostas.<uuid>), e um correlationId
 *   por pedido. Uma fila por pedido, como sugere o enunciado, criaria e apagaria milhares de filas.
 * - Se a conexão cair, o processo termina: o Docker (restart: unless-stopped) sobe de novo e reconecta.
 */
export class MensageriaAmqp implements IMensageria {
    private readonly declaradas = new Set<string>();
    private readonly aguardando = new Map<string, (resposta: Resposta) => void>();
    private filaRetorno: Promise<string> | null = null;
    private aberta = true;
    private encerrando = false;

    private constructor(
        private readonly conexao: ChannelModel,
        private readonly canal: ConfirmChannel,
        private readonly logger: ILogger,
        private readonly timeoutMs: number
    ) {}

    public static async conectar(opcoes: OpcoesAmqp): Promise<MensageriaAmqp> {
        const tentativas = opcoes.tentativas ?? 20;
        for (let tentativa = 1; ; tentativa++) {
            try {
                const conexao = await connect(opcoes.url);
                const canal = await conexao.createConfirmChannel();
                await canal.prefetch(20);
                const mensageria = new MensageriaAmqp(conexao, canal, opcoes.logger, opcoes.timeoutMs ?? 5_000);
                conexao.on('error', (erro: Error) => opcoes.logger.error('Erro na conexão com o RabbitMQ', { erro: erro.message }));
                conexao.on('close', () => mensageria.aoFechar());
                // O canal pode fechar sozinho (erro de protocolo) com a conexão aberta: sem ele o serviço fica mudo.
                canal.on('error', (erro: Error) => opcoes.logger.error('Erro no canal do RabbitMQ', { erro: erro.message }));
                canal.on('close', () => mensageria.aoFechar());
                opcoes.logger.info('Conectado ao RabbitMQ');
                return mensageria;
            } catch (erro) {
                if (tentativa >= tentativas) throw erro;
                opcoes.logger.warn('RabbitMQ indisponível, nova tentativa em 3 s', { tentativa });
                await esperar(3_000);
            }
        }
    }

    public async publicar(fila: string, mensagem: unknown): Promise<void> {
        await this.declarar(fila);
        this.canal.sendToQueue(fila, json(mensagem), { persistent: true, contentType: 'application/json' });
        await this.canal.waitForConfirms();
    }

    public async consumir(fila: string, tratar: (mensagem: unknown) => Promise<void>): Promise<void> {
        await this.declarar(fila);
        await this.canal.consume(fila, (mensagem) => {
            if (!mensagem) return;
            processar(mensagem, tratar).then(
                () => this.canal.ack(mensagem),
                (erro: unknown) => {
                    // Volta para a fila só na primeira falha: uma mensagem que sempre falha não fica em loop.
                    const devolver = !mensagem.fields.redelivered;
                    this.logger.error('Falha ao processar mensagem', { fila, devolver, erro: String(erro) });
                    this.canal.nack(mensagem, false, devolver);
                }
            );
        });
    }

    public async requisitar<R>(fila: string, pedido: Pedido): Promise<R> {
        const [filaRetorno] = await Promise.all([this.prepararRetorno(), this.declarar(fila)]);
        const correlationId = randomUUID();
        const resposta = new Promise<Resposta>((resolver, rejeitar) => {
            const timer = setTimeout(() => {
                this.aguardando.delete(correlationId);
                rejeitar(new Error(`Sem resposta de ${fila} em ${this.timeoutMs} ms (${pedido.operacao})`));
            }, this.timeoutMs);
            this.aguardando.set(correlationId, (r) => {
                clearTimeout(timer);
                resolver(r);
            });
        });
        // Se o envio falhar, o timeout ainda dispara depois; sem este catch seria uma rejeição não tratada.
        resposta.catch(() => {});
        this.canal.sendToQueue(fila, json(pedido), {
            replyTo: filaRetorno,
            correlationId,
            contentType: 'application/json',
            // Pedido que ninguém atendeu a tempo é descartado pelo broker em vez de ficar acumulado na fila.
            expiration: String(this.timeoutMs)
        });
        await this.canal.waitForConfirms();
        return abrirResposta<R>(await resposta);
    }

    public async responder(fila: string, tratar: (pedido: Pedido) => Promise<unknown>): Promise<void> {
        await this.declarar(fila);
        await this.canal.consume(fila, (mensagem) => {
            if (!mensagem) return;
            const { replyTo, correlationId } = mensagem.properties;
            processar(mensagem, tratar)
                .then((valor): Resposta => ({ ok: true, valor }), respostaDeErro)
                .then((resposta) => {
                    if (replyTo) this.canal.sendToQueue(replyTo, json(resposta), { correlationId, contentType: 'application/json' });
                    this.canal.ack(mensagem);
                })
                .catch((erro: unknown) => {
                    this.logger.error('Falha ao responder pedido', { fila, erro: String(erro) });
                    this.canal.nack(mensagem, false, false);
                });
        });
    }

    public async verificar(): Promise<void> {
        if (!this.aberta) throw new Error('Conexão com o RabbitMQ fechada');
    }

    public async encerrar(): Promise<void> {
        this.encerrando = true;
        if (this.aberta) await this.conexao.close();
    }

    private async declarar(fila: string): Promise<void> {
        if (this.declaradas.has(fila)) return;
        await this.canal.assertQueue(fila, { durable: true });
        this.declaradas.add(fila);
    }

    /** Cria (uma vez) a fila de retorno deste processo e passa a entregar cada resposta a quem a pediu. */
    private prepararRetorno(): Promise<string> {
        this.filaRetorno ??= (async () => {
            const nome = `respostas.${randomUUID()}`;
            // Exclusiva: some sozinha quando o processo desconecta. Por isso não é durável.
            await this.canal.assertQueue(nome, { exclusive: true, autoDelete: true, durable: false });
            await this.canal.consume(
                nome,
                (mensagem) => {
                    const id = mensagem?.properties.correlationId as string | undefined;
                    const entregar = id ? this.aguardando.get(id) : undefined;
                    if (!mensagem || !id || !entregar) return; // resposta atrasada (já deu timeout): descarta
                    this.aguardando.delete(id);
                    entregar(lerJson(mensagem) as Resposta);
                },
                { noAck: true }
            );
            return nome;
        })();
        return this.filaRetorno;
    }

    private aoFechar(): void {
        if (this.encerrando || !this.aberta) return;
        this.aberta = false;
        this.logger.error('Conexão com o RabbitMQ perdida; encerrando para o Docker reiniciar o serviço');
        process.exit(1);
    }
}
