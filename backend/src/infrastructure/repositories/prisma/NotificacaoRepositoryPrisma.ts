import type { PrismaClient } from '#prisma/notificacoes';
import type { ICaixaMensagens, IEnviadorEmail, MensagemEmail, MensagemInterna } from '../../../application/ports/ICanaisNotificacao.js';
import type { ILogger } from '../../../application/ports/ILogger.js';

/**
 * Canais do cinebridge-notificacoes com histórico no notificacoes-db.
 * O envio de e-mail é simulado (log); em produção entraria um SMTP/SES aqui, sem mudar mais nada.
 */
export class NotificacaoRepositoryPrisma implements IEnviadorEmail, ICaixaMensagens {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly logger: ILogger
    ) {}

    public async enviar(mensagem: MensagemEmail): Promise<void> {
        await this.prisma.notificacao.create({
            data: { canal: 'EMAIL', destinatario: mensagem.para, titulo: mensagem.assunto, texto: mensagem.corpo }
        });
        this.logger.info('E-mail enviado (simulado)', { para: mensagem.para, assunto: mensagem.assunto });
    }

    public async entregar(mensagem: MensagemInterna): Promise<void> {
        await this.prisma.notificacao.create({
            data: {
                canal: 'INTERNA',
                destinatario: mensagem.destinatarioId,
                titulo: mensagem.titulo,
                texto: mensagem.texto,
                criadaEm: mensagem.criadaEm
            }
        });
    }

    public async listar(destinatarioId: string): Promise<MensagemInterna[]> {
        const linhas = await this.prisma.notificacao.findMany({
            where: { canal: 'INTERNA', destinatario: destinatarioId },
            orderBy: { criadaEm: 'asc' }
        });
        return linhas.map((l) => ({ destinatarioId: l.destinatario, titulo: l.titulo, texto: l.texto, criadaEm: l.criadaEm }));
    }
}
