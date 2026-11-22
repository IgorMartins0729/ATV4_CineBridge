import { NotificadorTipoProjeto, type DadosRecomendacaoGerada } from '../base/NotificadorTipoProjeto.js';

export class NotificadorGeral extends NotificadorTipoProjeto {
    readonly nome = 'NotificadorGeral';

    protected assunto(dados: DadosRecomendacaoGerada): string {
        return `Recomendação pronta: "${dados.titulo}"`;
    }

    protected resumo(dados: DadosRecomendacaoGerada): string {
        return `${dados.recomendados.length} profissional(is) recomendado(s) para "${dados.titulo}" (estratégia ${dados.estrategia}).`;
    }
}
