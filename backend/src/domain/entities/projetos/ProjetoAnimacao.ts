import { TipoCaptacao } from '../../enums/TipoCaptacao.js';
import { TipoProjeto } from '../../enums/TipoProjeto.js';
import { Projeto, type EspecificosProjeto, type ProjetoProps } from '../Projeto.js';
import { lerListaTexto, lerOpcao, limparLista } from './especificos.js';

export const TECNICAS_ANIMACAO = ['2D', '3D', 'STOP_MOTION'] as const;
export type TecnicaAnimacao = (typeof TECNICAS_ANIMACAO)[number];

export interface EspecificosAnimacao {
    tecnica: TecnicaAnimacao;
    /** Softwares de modelagem/animação usados no pipeline (ex.: Blender, Maya). */
    softwares: string[];
}

export type ProjetoAnimacaoProps = Omit<ProjetoProps, 'tipoCaptacao'> & EspecificosAnimacao;

export class ProjetoAnimacao extends Projeto {
    private readonly tecnica: TecnicaAnimacao;
    private readonly softwares: string[];

    constructor(props: ProjetoAnimacaoProps) {
        super({ ...props, tipoCaptacao: TipoCaptacao.ANIMACAO });
        this.tecnica = props.tecnica;
        this.softwares = limparLista(props.softwares);
    }

    public static lerEspecificos(dados: Readonly<Record<string, unknown>>): Partial<EspecificosAnimacao> {
        const tecnica = lerOpcao(dados, 'tecnica', TECNICAS_ANIMACAO);
        const softwares = lerListaTexto(dados, 'softwares');
        return { ...(tecnica ? { tecnica } : {}), ...(softwares ? { softwares } : {}) };
    }

    public override getTipo(): TipoProjeto {
        return TipoProjeto.ANIMACAO;
    }

    public getTecnica(): TecnicaAnimacao {
        return this.tecnica;
    }

    public getSoftwares(): readonly string[] {
        return this.softwares;
    }

    public override getEspecificos(): EspecificosProjeto {
        return { tecnica: this.tecnica, softwares: [...this.softwares] };
    }

    public override clonar(ajustes: Partial<ProjetoAnimacaoProps> = {}): ProjetoAnimacao {
        return new ProjetoAnimacao({
            ...this.propsClonadas(ajustes),
            tecnica: ajustes.tecnica ?? this.tecnica,
            softwares: [...(ajustes.softwares ?? this.softwares)]
        });
    }
}
