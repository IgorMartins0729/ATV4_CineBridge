import { TipoProjeto } from '../../enums/TipoProjeto.js';
import { Projeto, type ProjetoProps } from '../Projeto.js';
import { ProjetoAnimacao } from './ProjetoAnimacao.js';
import { ProjetoDocumentario } from './ProjetoDocumentario.js';
import { ProjetoPublicitario } from './ProjetoPublicitario.js';

type Restaurador = (props: ProjetoProps, especificos: Readonly<Record<string, unknown>>) => Projeto;

/** Uma entrada por tipo: um tipo novo só acrescenta uma linha aqui, sem if/switch. */
const RESTAURADORES: Readonly<Record<TipoProjeto, Restaurador>> = {
    [TipoProjeto.GERAL]: (props) => new Projeto(props),
    [TipoProjeto.DOCUMENTARIO]: (props, especificos) =>
        new ProjetoDocumentario({ ...props, tema: '', entrevistados: [], ...ProjetoDocumentario.lerEspecificos(especificos) }),
    [TipoProjeto.ANIMACAO]: (props, especificos) =>
        new ProjetoAnimacao({ ...props, tecnica: '2D', softwares: [], ...ProjetoAnimacao.lerEspecificos(especificos) }),
    [TipoProjeto.PUBLICITARIO]: (props, especificos) =>
        new ProjetoPublicitario({ ...props, cliente: '', veiculacao: [], ...ProjetoPublicitario.lerEspecificos(especificos) })
};

/** Recria a subclasse certa a partir dos dados gravados (usado pelos repositórios). */
export function restaurarProjeto(
    tipo: TipoProjeto,
    props: ProjetoProps,
    especificos: Readonly<Record<string, unknown>> = {}
): Projeto {
    return RESTAURADORES[tipo](props, especificos);
}
