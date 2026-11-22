import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoPublicitario } from '../../../domain/entities/projetos/ProjetoPublicitario.js';
import { Papel } from '../../../domain/enums/Papel.js';
import { ValidadorTipoProjeto } from '../base/ValidadorTipoProjeto.js';

/** Duração máxima de uma peça publicitária, em minutos. */
export const DURACAO_MAXIMA_PUBLICIDADE = 5;

export class ValidadorPublicitario extends ValidadorTipoProjeto<ProjetoPublicitario> {
    protected readonly descricaoTipo = 'publicitário';
    protected readonly competenciasChave = ['ficcao', 'animacao'];

    protected ehDoTipo(projeto: Projeto): projeto is ProjetoPublicitario {
        return projeto instanceof ProjetoPublicitario;
    }

    protected regras(projeto: ProjetoPublicitario): string[] {
        const longaDemais = projeto.getDuracao() > DURACAO_MAXIMA_PUBLICIDADE;
        return [
            ...this.exigirPapeis(projeto, [Papel.DIRETOR, Papel.EDITOR], 'direção e finalização da peça'),
            ...(longaDemais ? [`peça publicitária deve ter no máximo ${DURACAO_MAXIMA_PUBLICIDADE} minutos`] : [])
        ];
    }
}
