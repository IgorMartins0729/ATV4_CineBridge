import { ValidacaoError } from '../../erros.js';
import { TipoCaptacao } from '../../enums/TipoCaptacao.js';
import { TipoProjeto } from '../../enums/TipoProjeto.js';
import { Projeto, type EspecificosProjeto, type ProjetoProps } from '../Projeto.js';
import { lerListaTexto, lerTexto, limparLista } from './especificos.js';

export interface EspecificosPublicitario {
    /** Marca/empresa anunciante. */
    cliente: string;
    /** Onde a peça será veiculada (ex.: TV, internet, cinema). */
    veiculacao: string[];
}

/** Publicidade pode ser filmada (ficção, o padrão) ou animada. */
export type ProjetoPublicitarioProps = Omit<ProjetoProps, 'tipoCaptacao'> & {
    tipoCaptacao?: TipoCaptacao;
} & EspecificosPublicitario;

export class ProjetoPublicitario extends Projeto {
    private readonly cliente: string;
    private readonly veiculacao: string[];

    constructor(props: ProjetoPublicitarioProps) {
        super({ ...props, tipoCaptacao: props.tipoCaptacao ?? TipoCaptacao.FICCAO });
        if (props.cliente.trim().length === 0) {
            throw new ValidacaoError('Cliente da peça publicitária é obrigatório');
        }
        this.cliente = props.cliente.trim();
        this.veiculacao = limparLista(props.veiculacao);
    }

    public static lerEspecificos(dados: Readonly<Record<string, unknown>>): Partial<EspecificosPublicitario> {
        const cliente = lerTexto(dados, 'cliente');
        const veiculacao = lerListaTexto(dados, 'veiculacao');
        return { ...(cliente !== undefined ? { cliente } : {}), ...(veiculacao ? { veiculacao } : {}) };
    }

    public override getTipo(): TipoProjeto {
        return TipoProjeto.PUBLICITARIO;
    }

    public getCliente(): string {
        return this.cliente;
    }

    public getVeiculacao(): readonly string[] {
        return this.veiculacao;
    }

    public override getEspecificos(): EspecificosProjeto {
        return { cliente: this.cliente, veiculacao: [...this.veiculacao] };
    }

    public override clonar(ajustes: Partial<ProjetoPublicitarioProps> = {}): ProjetoPublicitario {
        return new ProjetoPublicitario({
            ...this.propsClonadas(ajustes),
            cliente: ajustes.cliente ?? this.cliente,
            veiculacao: [...(ajustes.veiculacao ?? this.veiculacao)]
        });
    }
}
