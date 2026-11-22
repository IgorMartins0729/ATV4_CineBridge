import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoDocumentario } from '../../../domain/entities/projetos/ProjetoDocumentario.js';
import { Papel } from '../../../domain/enums/Papel.js';
import { ValidadorTipoProjeto } from '../base/ValidadorTipoProjeto.js';

export class ValidadorDocumentario extends ValidadorTipoProjeto<ProjetoDocumentario> {
    protected readonly descricaoTipo = 'documentário';
    protected readonly competenciasChave = ['documentario', 'pesquisa'];

    protected ehDoTipo(projeto: Projeto): projeto is ProjetoDocumentario {
        return projeto instanceof ProjetoDocumentario;
    }

    protected regras(projeto: ProjetoDocumentario): string[] {
        const comEntrevistas = projeto.getEntrevistados().length > 0;
        return [
            ...this.exigirPapeis(projeto, [Papel.ROTEIRISTA], 'pesquisa e roteiro'),
            ...this.exigirPapeis(projeto, comEntrevistas ? [Papel.SONOPLASTA] : [], 'som das entrevistas')
        ];
    }
}
