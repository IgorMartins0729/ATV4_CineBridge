import { TipoEvento, type Evento } from '../eventos/EventoRecomendacao.js';
import type { ICaixaMensagens, IEnviadorEmail } from '../ports/ICanaisNotificacao.js';
import type { Observador } from './Observador.js';

type TipoProjetoEvento = TipoEvento.PROJETO_CRIADO | TipoEvento.PROJETO_ATUALIZADO | TipoEvento.PROJETO_FINALIZADO;

const MODELOS: Record<TipoProjetoEvento, { titulo: string; texto: (titulo: string) => string; email: boolean }> = {
    [TipoEvento.PROJETO_CRIADO]: { titulo: 'Projeto registrado', texto: (t) => `O projeto "${t}" foi registrado.`, email: true },
    [TipoEvento.PROJETO_ATUALIZADO]: { titulo: 'Projeto atualizado', texto: (t) => `O projeto "${t}" foi atualizado.`, email: false },
    [TipoEvento.PROJETO_FINALIZADO]: {
        titulo: 'Projeto finalizado',
        texto: (t) => `A montagem da equipe de "${t}" foi concluída.`,
        email: true
    }
};

/**
 * Observer do cinebridge-notificacoes para os eventos da fila "eventos-projetos": avisa o produtor.
 * Atualizações só vão para a caixa interna (são frequentes); criação e finalização também vão por e-mail.
 */
export class NotificadorProjetos implements Observador {
    readonly nome = 'NotificadorProjetos';

    constructor(
        private readonly email: IEnviadorEmail,
        private readonly caixa: ICaixaMensagens
    ) {}

    public async atualizar(evento: Evento): Promise<void> {
        if (!(evento.tipo in MODELOS)) return;
        const { tipo, dados, ocorridoEm } = evento as Extract<Evento, { tipo: TipoProjetoEvento }>;
        const modelo = MODELOS[tipo];
        const texto = modelo.texto(dados.titulo);
        await this.caixa.entregar({ destinatarioId: dados.produtor.id, titulo: modelo.titulo, texto, criadaEm: ocorridoEm });
        if (modelo.email) await this.email.enviar({ para: dados.produtor.email, assunto: `${modelo.titulo}: ${dados.titulo}`, corpo: texto });
    }
}
