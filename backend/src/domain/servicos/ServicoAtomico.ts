import { Papel } from '../enums/Papel.js';
import type { ServicoAtomicoInfo, ServicoProjeto } from './ServicoProjeto.js';

export interface ServicoAtomicoProps {
    nome: string;
    papel: Papel;
    /** Custo estimado, em reais. */
    custo: number;
    /** Prazo de execução, em dias (0 = não estimado). */
    prazo: number;
    /** Padrão: 1. */
    peso?: number;
}

const PAPEIS = new Set<string>(Object.values(Papel));

/** Composite (folha): um serviço individual, como edição de vídeo ou mixagem de áudio. */
export class ServicoAtomico implements ServicoProjeto, ServicoAtomicoInfo {
    readonly nome: string;
    readonly papel: Papel;
    readonly peso: number;
    private readonly custo: number;
    private readonly prazo: number;

    constructor(props: ServicoAtomicoProps) {
        this.nome = props.nome.trim();
        this.papel = props.papel;
        this.custo = props.custo;
        this.prazo = props.prazo;
        this.peso = props.peso ?? 1;
    }

    public calcularCusto(): number {
        return this.custo;
    }

    public listarSubservicos(): readonly ServicoProjeto[] {
        return [];
    }

    public obterPrazo(): number {
        return this.prazo;
    }

    public listarAtomicos(): readonly ServicoAtomicoInfo[] {
        return [this];
    }

    public validar(): string[] {
        const rotulo = this.nome || '(sem nome)';
        const problemas: string[] = [];
        if (!this.nome) problemas.push('serviço sem nome');
        if (!PAPEIS.has(this.papel)) problemas.push(`${rotulo}: papel técnico inválido "${String(this.papel)}"`);
        if (!Number.isFinite(this.custo) || this.custo < 0) problemas.push(`${rotulo}: custo deve ser zero ou positivo`);
        if (!Number.isFinite(this.prazo) || this.prazo < 0) problemas.push(`${rotulo}: prazo deve ser zero ou positivo`);
        if (!Number.isFinite(this.peso) || this.peso <= 0) problemas.push(`${rotulo}: peso deve ser maior que zero`);
        return problemas;
    }
}
