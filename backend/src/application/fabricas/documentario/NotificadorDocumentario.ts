import {
    especificoLista,
    especificoTexto,
    NotificadorTipoProjeto,
    type DadosRecomendacaoGerada
} from '../base/NotificadorTipoProjeto.js';

export class NotificadorDocumentario extends NotificadorTipoProjeto {
    readonly nome = 'NotificadorDocumentario';

    protected assunto(dados: DadosRecomendacaoGerada): string {
        return `[Documentário] Equipe sugerida para "${dados.titulo}"`;
    }

    protected resumo(dados: DadosRecomendacaoGerada): string {
        const entrevistados = especificoLista(dados, 'entrevistados').length;
        return (
            `Documentário sobre "${especificoTexto(dados, 'tema')}": ${dados.recomendados.length} profissional(is) ` +
            `recomendado(s), priorizando pesquisa e captação documental. Entrevistados previstos: ${entrevistados}.`
        );
    }
}
