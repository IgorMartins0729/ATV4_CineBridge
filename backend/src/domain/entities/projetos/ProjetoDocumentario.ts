import { ValidacaoError } from '../../erros.js';
import { TipoCaptacao } from '../../enums/TipoCaptacao.js';
import { TipoProjeto } from '../../enums/TipoProjeto.js';
import { Projeto, type EspecificosProjeto, type ProjetoProps } from '../Projeto.js';
import { lerListaTexto, lerTexto, limparLista } from './especificos.js';

export interface EspecificosDocumentario {
    tema: string;
    /** Pessoas previstas para entrevista. */
    entrevistados: string[];
}

export type ProjetoDocumentarioProps = Omit<ProjetoProps, 'tipoCaptacao'> & EspecificosDocumentario;

export class ProjetoDocumentario extends Projeto {
    private readonly tema: string;
    private readonly entrevistados: string[];

    constructor(props: ProjetoDocumentarioProps) {
        super({ ...props, tipoCaptacao: TipoCaptacao.DOCUMENTARIO });
        if (props.tema.trim().length === 0) {
            throw new ValidacaoError('Tema do documentário é obrigatório');
        }
        this.tema = props.tema.trim();
        this.entrevistados = limparLista(props.entrevistados);
    }

    public static lerEspecificos(dados: Readonly<Record<string, unknown>>): Partial<EspecificosDocumentario> {
        const tema = lerTexto(dados, 'tema');
        const entrevistados = lerListaTexto(dados, 'entrevistados');
        return { ...(tema !== undefined ? { tema } : {}), ...(entrevistados ? { entrevistados } : {}) };
    }

    public override getTipo(): TipoProjeto {
        return TipoProjeto.DOCUMENTARIO;
    }

    public getTema(): string {
        return this.tema;
    }

    public getEntrevistados(): readonly string[] {
        return this.entrevistados;
    }

    public override getEspecificos(): EspecificosProjeto {
        return { tema: this.tema, entrevistados: [...this.entrevistados] };
    }

    public override clonar(ajustes: Partial<ProjetoDocumentarioProps> = {}): ProjetoDocumentario {
        return new ProjetoDocumentario({
            ...this.propsClonadas(ajustes),
            tema: ajustes.tema ?? this.tema,
            entrevistados: [...(ajustes.entrevistados ?? this.entrevistados)]
        });
    }
}
