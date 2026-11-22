import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoDocumentario } from '../../../domain/entities/projetos/ProjetoDocumentario.js';
import { GeradorRelatorio } from '../../visitors/GeradorRelatorio.js';
import { ValidadorDocumentario } from './ValidadorDocumentario.js';

/** Relatório do documentário: tema, entrevistas e experiência documental da equipe. */
export class RelatorioDocumentario extends GeradorRelatorio {
    constructor() {
        super(new ValidadorDocumentario());
    }

    protected override secaoDoTipo(projeto: Projeto): string[] {
        if (!(projeto instanceof ProjetoDocumentario)) return [];
        const entrevistados = projeto.getEntrevistados();
        const documental = this.mediaDaEquipe(projeto, 'documentario');
        const pesquisa = this.mediaDaEquipe(projeto, 'pesquisa');
        return [
            `Tema: ${projeto.getTema()}`,
            `Entrevistados previstos: ${entrevistados.length}${entrevistados.length ? ` (${entrevistados.join(', ')})` : ''}`,
            documental === null || pesquisa === null
                ? 'Experiência documental da equipe: sem equipe'
                : `Experiência documental média da equipe: ${documental.toFixed(1)}/10 | pesquisa: ${pesquisa.toFixed(1)}/10`
        ];
    }
}
