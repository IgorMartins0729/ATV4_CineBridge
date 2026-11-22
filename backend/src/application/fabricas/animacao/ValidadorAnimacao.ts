import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoAnimacao } from '../../../domain/entities/projetos/ProjetoAnimacao.js';
import { Papel } from '../../../domain/enums/Papel.js';
import { ValidadorTipoProjeto } from '../base/ValidadorTipoProjeto.js';

export class ValidadorAnimacao extends ValidadorTipoProjeto<ProjetoAnimacao> {
    protected readonly descricaoTipo = 'animação';
    protected readonly competenciasChave = ['animacao', 'animacao3d'];

    protected ehDoTipo(projeto: Projeto): projeto is ProjetoAnimacao {
        return projeto instanceof ProjetoAnimacao;
    }

    protected regras(projeto: ProjetoAnimacao): string[] {
        const semSoftware3d = projeto.getTecnica() === '3D' && projeto.getSoftwares().length === 0;
        return [
            ...this.exigirPapeis(projeto, [Papel.EFEITOS_VISUAIS], 'modelagem e animação'),
            ...(semSoftware3d ? ['animação 3D precisa informar ao menos um software de modelagem'] : [])
        ];
    }
}
