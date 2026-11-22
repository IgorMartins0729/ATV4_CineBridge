import { TipoEvento, type DadosEvento, type Evento } from '../../eventos/EventoRecomendacao.js';
import type { Observador } from '../../observers/Observador.js';
import type { ICaixaMensagens, IEnviadorEmail } from '../../ports/ICanaisNotificacao.js';

export interface CanaisNotificador {
    email: IEnviadorEmail;
    mensagens: ICaixaMensagens;
}

export type DadosRecomendacaoGerada = DadosEvento[TipoEvento.RECOMENDACAO_GERADA];

/**
 * Base dos notificadores de cada tipo: quando uma recomendação é gerada, envia ao produtor
 * um resumo no formato do tipo de projeto (e-mail e mensagem interna).
 */
export abstract class NotificadorTipoProjeto implements Observador {
    public abstract readonly nome: string;
    private readonly canais: CanaisNotificador;

    constructor(canais: CanaisNotificador) {
        this.canais = canais;
    }

    protected abstract assunto(dados: DadosRecomendacaoGerada): string;

    protected abstract resumo(dados: DadosRecomendacaoGerada): string;

    public async atualizar(evento: Evento): Promise<void> {
        if (evento.tipo !== TipoEvento.RECOMENDACAO_GERADA) return;
        const dados = evento.dados;
        const assunto = this.assunto(dados);
        const texto = this.resumo(dados);
        await Promise.all([
            this.canais.email.enviar({ para: dados.produtor.email, assunto, corpo: texto }),
            this.canais.mensagens.entregar({
                destinatarioId: dados.produtor.id,
                titulo: assunto,
                texto,
                criadaEm: evento.ocorridoEm
            })
        ]);
    }
}

/** Lê um atributo específico como texto ("" quando ausente). */
export function especificoTexto(dados: DadosRecomendacaoGerada, campo: string): string {
    const valor = dados.especificos[campo];
    return typeof valor === 'string' ? valor : '';
}

/** Lê um atributo específico como lista de textos ([] quando ausente). */
export function especificoLista(dados: DadosRecomendacaoGerada, campo: string): readonly string[] {
    const valor = dados.especificos[campo];
    return Array.isArray(valor) ? valor : [];
}
