import { PrismaClient } from '#prisma/notificacoes';
import { NotificadorProjetos } from '../application/observers/NotificadorProjetos.js';
import { atenderNotificacoes } from '../infrastructure/remotos/notificacoes.js';
import { NotificacaoRepositoryPrisma } from '../infrastructure/repositories/prisma/NotificacaoRepositoryPrisma.js';
import { iniciarServico } from './comum.js';

/**
 * cinebridge-notificacoes (porta 3003): envia e-mails e mensagens internas e guarda o histórico (notificacoes-db).
 * Consome "envio-notificacoes" e "eventos-projetos" (Observer). Variáveis: DATABASE_URL, RABBITMQ_URL, PORT.
 */
iniciarServico('cinebridge-notificacoes', 3003, async ({ logger, mensageria }) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    const canal = new NotificacaoRepositoryPrisma(prisma, logger);

    await atenderNotificacoes(mensageria, { email: canal, mensagens: canal }, [new NotificadorProjetos(canal, canal)]);
    return {
        verificacoes: { banco: () => prisma.$queryRawUnsafe('SELECT 1') },
        rotas: (app) => {
            app.get<{ Params: { destinatarioId: string } }>('/notificacoes/:destinatarioId', (req) => canal.listar(req.params.destinatarioId));
        },
        encerrar: () => prisma.$disconnect()
    };
});
