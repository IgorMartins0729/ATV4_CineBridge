import {
    especificoLista,
    especificoTexto,
    NotificadorTipoProjeto,
    type DadosRecomendacaoGerada
} from '../base/NotificadorTipoProjeto.js';

export class NotificadorAnimacao extends NotificadorTipoProjeto {
    readonly nome = 'NotificadorAnimacao';

    protected assunto(dados: DadosRecomendacaoGerada): string {
        return `[Animação] Equipe sugerida para "${dados.titulo}"`;
    }

    protected resumo(dados: DadosRecomendacaoGerada): string {
        const softwares = especificoLista(dados, 'softwares');
        return (
            `Animação ${especificoTexto(dados, 'tecnica')} (pipeline: ${softwares.join(', ') || 'a definir'}): ` +
            `${dados.recomendados.length} profissional(is) recomendado(s), priorizando modelagem e animação 3D.`
        );
    }
}
