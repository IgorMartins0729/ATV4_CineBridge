import type { ServicoAtomicoInfo, ServicoProjeto } from './ServicoProjeto.js';

export interface PacoteServicoProps {
    nome: string;
    subservicos: readonly ServicoProjeto[];
    /**
     * false (padrão): as etapas acontecem uma depois da outra, e o prazo é a soma.
     * true: as etapas correm ao mesmo tempo (ex.: coloração e mixagem), e o prazo é o da mais longa.
     */
    paralelo?: boolean;
}

/** Composite (nó composto): um pacote que contém serviços atômicos e/ou outros pacotes. */
export class PacoteServico implements ServicoProjeto {
    readonly nome: string;
    readonly paralelo: boolean;
    private readonly subservicos: readonly ServicoProjeto[];

    constructor(props: PacoteServicoProps) {
        this.nome = props.nome.trim();
        this.subservicos = [...props.subservicos];
        this.paralelo = props.paralelo ?? false;
    }

    public calcularCusto(): number {
        return this.subservicos.reduce((total, s) => total + s.calcularCusto(), 0);
    }

    public listarSubservicos(): readonly ServicoProjeto[] {
        return this.subservicos;
    }

    public obterPrazo(): number {
        const prazos = this.subservicos.map((s) => s.obterPrazo());
        if (prazos.length === 0) return 0;
        return this.paralelo ? Math.max(...prazos) : prazos.reduce((total, p) => total + p, 0);
    }

    public listarAtomicos(): readonly ServicoAtomicoInfo[] {
        return this.subservicos.flatMap((s) => s.listarAtomicos());
    }

    public validar(): string[] {
        const rotulo = this.nome || '(pacote sem nome)';
        const problemas: string[] = [];
        if (!this.nome) problemas.push('pacote sem nome');
        if (this.subservicos.length === 0) problemas.push(`${rotulo}: o pacote precisa de ao menos um serviço`);
        for (const servico of this.subservicos) {
            problemas.push(...servico.validar().map((p) => `${rotulo} > ${p}`));
        }
        return problemas;
    }
}
