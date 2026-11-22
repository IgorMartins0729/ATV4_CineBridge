import { randomUUID } from 'node:crypto';
import type { Papel } from '../enums/Papel.js';
import type { Profissional } from './Profissional.js';

/** Profissional candidato a um papel, com a pontuação calculada pela estratégia (0 a 1). */
export interface ProfissionalPontuado {
    readonly profissional: Profissional;
    readonly pontuacao: number;
}

/** Candidatos ordenados (do melhor para o pior) por papel, com pontuação. */
export type Ranking = Map<Papel, ProfissionalPontuado[]>;

function chave(papel: Papel, profissional: Profissional): string {
    return `${papel}|${profissional.getId()}`;
}

/**
 * O `Map<Papel, Profissional[]>` do diagrama (cada lista do melhor para o pior), que também guarda
 * a pontuação de cada candidato. Como é um Map, pode ser usado onde o diagrama pede Map<Papel, Profissional[]>.
 */
export class RecomendacoesPorPapel extends Map<Papel, Profissional[]> {
    private readonly pontuacoes = new Map<string, number>();

    public static deRanking(ranking: Ranking): RecomendacoesPorPapel {
        const recomendacoes = new RecomendacoesPorPapel();
        for (const [papel, lista] of ranking) {
            recomendacoes.set(papel, lista.map((c) => c.profissional));
            for (const c of lista) recomendacoes.pontuacoes.set(chave(papel, c.profissional), c.pontuacao);
        }
        return recomendacoes;
    }

    /**
     * Copia qualquer Map<Papel, Profissional[]> (ex.: o devolvido por posProcessar ou por uma estratégia externa).
     * A pontuação vem de `referencia` (ou do próprio mapa); se for desconhecida, é calculada pela posição na lista.
     */
    public static de(
        mapa: ReadonlyMap<Papel, readonly Profissional[]>,
        referencia?: RecomendacoesPorPapel
    ): RecomendacoesPorPapel {
        const fonte = referencia ?? (mapa instanceof RecomendacoesPorPapel ? mapa : undefined);
        const recomendacoes = new RecomendacoesPorPapel();
        for (const [papel, lista] of mapa) {
            recomendacoes.set(papel, [...lista]);
            lista.forEach((profissional, posicao) => {
                const conhecida = fonte?.pontuacoes.get(chave(papel, profissional));
                recomendacoes.pontuacoes.set(chave(papel, profissional), conhecida ?? 1 - posicao / lista.length);
            });
        }
        return recomendacoes;
    }

    /** Pontuação (0 a 1) do profissional no papel; 0 se ele não foi recomendado para o papel. */
    public pontuacao(papel: Papel, profissional: Profissional): number {
        return this.pontuacoes.get(chave(papel, profissional)) ?? 0;
    }

    /** Só os papéis pedidos (papel sem recomendação vira lista vazia). */
    public somente(papeis: readonly Papel[]): RecomendacoesPorPapel {
        const filtrado = new Map(papeis.map((papel) => [papel, this.get(papel) ?? []]));
        return RecomendacoesPorPapel.de(filtrado, this);
    }

    public paraRanking(): Ranking {
        return new Map(
            [...this].map(([papel, lista]) => [
                papel,
                lista.map((profissional) => ({ profissional, pontuacao: this.pontuacao(papel, profissional) }))
            ])
        );
    }
}

export interface RecomendacaoProps {
    id?: string;
    projetoId: string;
    estrategia: string;
    ranking: Ranking;
    /** true quando a recomendação foi gerada com dados incompletos (fallback). */
    parcial: boolean;
    papeisSemCandidatos?: Papel[];
    geradaEm?: Date;
}

/** Resultado de uma rodada do motor de recomendação, guardado para auditoria. */
export class Recomendacao {
    private readonly id: string;
    private readonly projetoId: string;
    private readonly estrategia: string;
    private readonly ranking: Ranking;
    private readonly parcial: boolean;
    private readonly papeisSemCandidatos: Papel[];
    private readonly geradaEm: Date;

    constructor(props: RecomendacaoProps) {
        this.id = props.id ?? randomUUID();
        this.projetoId = props.projetoId;
        this.estrategia = props.estrategia;
        this.ranking = new Map([...props.ranking].map(([papel, lista]) => [papel, [...lista]]));
        this.parcial = props.parcial;
        this.papeisSemCandidatos = [...(props.papeisSemCandidatos ?? [])];
        this.geradaEm = new Date(props.geradaEm ?? new Date());
    }

    public getId(): string {
        return this.id;
    }

    public getProjetoId(): string {
        return this.projetoId;
    }

    public getEstrategia(): string {
        return this.estrategia;
    }

    public isParcial(): boolean {
        return this.parcial;
    }

    public getPapeisSemCandidatos(): readonly Papel[] {
        return this.papeisSemCandidatos;
    }

    public getGeradaEm(): Date {
        return new Date(this.geradaEm);
    }

    public getPapeis(): Papel[] {
        return [...this.ranking.keys()];
    }

    public getCandidatos(papel: Papel): readonly ProfissionalPontuado[] {
        return this.ranking.get(papel) ?? [];
    }

    public melhorCandidato(papel: Papel): ProfissionalPontuado | null {
        return this.getCandidatos(papel)[0] ?? null;
    }
}
