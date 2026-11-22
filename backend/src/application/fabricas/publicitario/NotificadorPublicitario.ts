import {
    especificoLista,
    especificoTexto,
    NotificadorTipoProjeto,
    type DadosRecomendacaoGerada
} from '../base/NotificadorTipoProjeto.js';

export class NotificadorPublicitario extends NotificadorTipoProjeto {
    readonly nome = 'NotificadorPublicitario';

    protected assunto(dados: DadosRecomendacaoGerada): string {
        return `[Publicidade] Equipe sugerida para a peça de ${especificoTexto(dados, 'cliente')}`;
    }

    protected resumo(dados: DadosRecomendacaoGerada): string {
        const veiculacao = especificoLista(dados, 'veiculacao');
        return (
            `Peça "${dados.titulo}" para ${especificoTexto(dados, 'cliente')} (veiculação: ${veiculacao.join(', ') || 'a definir'}): ` +
            `${dados.recomendados.length} profissional(is) recomendado(s), com foco em acabamento visual.`
        );
    }
}
