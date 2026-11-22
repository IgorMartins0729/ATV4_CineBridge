import { Equipe } from '../../domain/entities/Equipe.js';
import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import { RecomendacoesPorPapel, type Ranking } from '../../domain/entities/Recomendacao.js';
import type { Papel } from '../../domain/enums/Papel.js';
import { RestricaoInvalidaError } from '../../domain/erros.js';
import type { FabricaProjeto } from '../fabricas/FabricaProjeto.js';
import type { RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy.js';

export interface OpcoesOrquestracao {
    /** Papéis a recomendar (padrão: todos). Usado na nova rodada de um único papel. */
    papeis?: readonly Papel[];
    /** Profissionais que não podem ser recomendados (ex.: rejeitados pelo produtor). */
    excluidos?: Iterable<string>;
    /** Membros já escolhidos que devem ser mantidos fixos. */
    fixos?: ReadonlyMap<Papel, Profissional>;
}

export interface ResultadoOrquestracao {
    /** Estratégia efetivamente usada (a recebida ou a criada pela fábrica). */
    estrategia: RecomendacaoStrategy;
    ranking: Ranking;
    /** Uma ou mais sugestões de equipe completa, da melhor para a pior. */
    sugestoes: Equipe[];
    papeisSemCandidatos: Papel[];
}

export interface ConfigOrquestrador {
    quantidadeSugestoes: number;
}

/**
 * Template Method: `orquestrar` define o esqueleto fixo do processo.
 * As subclasses implementam apenas as etapas variáveis (validar, normalizar, pós-processar).
 *
 * A fábrica (Abstract Factory) recebida no construtor fornece os objetos do tipo de projeto:
 * o validador e, quando nenhuma estratégia é passada, o recomendador. Assim o orquestrador
 * não tem nenhuma condicional por tipo de projeto.
 *
 * Cada orquestrador trabalha sobre um conjunto de candidatos (também recebido no construtor):
 * o SistemaRecomendacao cria um por rodada de recomendação.
 */
export abstract class OrquestradorEquipe {
    protected readonly fabrica: FabricaProjeto;
    protected readonly candidatos: readonly Profissional[];
    protected readonly config: ConfigOrquestrador;
    private problemas: string[] = [];
    private recomendacoesEmAndamento: RecomendacoesPorPapel | null = null;
    private resultado: ResultadoOrquestracao | null = null;

    constructor(fabrica: FabricaProjeto, candidatos: readonly Profissional[], config: ConfigOrquestrador) {
        // TypeScript não tem "final": este teste impede que uma subclasse troque o fluxo principal.
        if (this.orquestrar !== OrquestradorEquipe.prototype.orquestrar) {
            throw new Error(`${new.target.name} não pode sobrescrever orquestrar(): o fluxo principal é fixo`);
        }
        this.fabrica = fabrica;
        this.candidatos = [...candidatos];
        this.config = config;
    }

    public getFabrica(): FabricaProjeto {
        return this.fabrica;
    }

    /**
     * Método template: validar -> filtrar exclusões e inaptos -> normalizar -> recomendar -> pós-processar -> montar.
     * Retorna a melhor equipe sugerida (vazia se não houver candidatos). Os detalhes da rodada
     * (todas as sugestões, ranking com pontuação, papéis sem candidatos) ficam em `getResultado()`.
     * @param estrategia estratégia escolhida; se não vier, usa o recomendador da fábrica.
     * @param opcoes rodada parcial: só alguns papéis, com exclusões e membros fixos.
     */
    public orquestrar(projeto: Projeto, estrategia?: RecomendacaoStrategy, opcoes: OpcoesOrquestracao = {}): Equipe {
        this.problemas = [];
        const validador = this.fabrica.criarValidador();
        const restricoesOk = this.validarRestricoes(projeto);
        if (!projeto.aceitar(validador)) {
            this.problemas.push(...validador.getProblemas());
        }
        if (!restricoesOk || this.problemas.length > 0) {
            throw new RestricaoInvalidaError(
                this.problemas.length > 0 ? this.problemas : ['o projeto não atende às restrições do orquestrador']
            );
        }

        const papeis = opcoes.papeis ?? projeto.getPapeis();
        const fixos = opcoes.fixos ?? new Map<Papel, Profissional>();
        const bloqueados = new Set(opcoes.excluidos ?? []);
        for (const fixo of fixos.values()) bloqueados.add(fixo.getId());
        const permitidos = this.candidatos.filter((p) => !bloqueados.has(p.getId()) && p.aceitar(validador));

        const recomendador = estrategia ?? this.fabrica.criarRecomendador();
        const normalizados = this.normalizarDados(projeto, permitidos);
        const recomendacoes = RecomendacoesPorPapel.de(recomendador.recomendar(projeto, normalizados)).somente(papeis);

        this.recomendacoesEmAndamento = recomendacoes;
        let final: RecomendacoesPorPapel;
        try {
            final = RecomendacoesPorPapel.de(this.posProcessar(recomendacoes), recomendacoes);
        } finally {
            this.recomendacoesEmAndamento = null;
        }

        const ranking = final.paraRanking();
        const sugestoes = this.montarSugestoes(projeto, papeis, ranking, fixos);
        this.resultado = {
            estrategia: recomendador,
            ranking,
            sugestoes,
            papeisSemCandidatos: papeis.filter((papel) => (final.get(papel)?.length ?? 0) === 0)
        };
        return sugestoes[0] ?? new Equipe();
    }

    /** Detalhes da última chamada de `orquestrar`. */
    public getResultado(): ResultadoOrquestracao {
        if (!this.resultado) {
            throw new Error('orquestrar() ainda não foi chamado');
        }
        return this.resultado;
    }

    /** true = o projeto atende às restrições. Use `reportarProblema` para explicar o que falhou. */
    protected abstract validarRestricoes(projeto: Projeto): boolean;

    protected abstract normalizarDados(projeto: Projeto, profissionais: readonly Profissional[]): Profissional[];

    protected abstract posProcessar(recomendacoes: Map<Papel, Profissional[]>): Map<Papel, Profissional[]>;

    /** Registra o motivo de uma restrição não atendida (vai na mensagem de erro). */
    protected reportarProblema(problema: string): void {
        this.problemas.push(problema);
    }

    /** Pontuação dada pela estratégia ao profissional no papel (disponível durante o pós-processamento). */
    protected pontuacaoDe(papel: Papel, profissional: Profissional): number {
        return this.recomendacoesEmAndamento?.pontuacao(papel, profissional) ?? 0;
    }

    /**
     * Etapa fixa: monta N sugestões (sugestão k usa o k-ésimo melhor de cada papel),
     * sem repetir profissional e cabendo no orçamento sempre que possível.
     */
    private montarSugestoes(
        projeto: Projeto,
        papeis: readonly Papel[],
        ranking: Ranking,
        fixos: ReadonlyMap<Papel, Profissional>
    ): Equipe[] {
        const ordem = [...papeis].sort((a, b) => projeto.pesoDoPapel(b) - projeto.pesoDoPapel(a));
        const sugestoes: Equipe[] = [];
        const composicoesVistas = new Set<string>();

        for (let k = 0; k < this.config.quantidadeSugestoes; k++) {
            const escolhidos = new Map<Papel, Profissional>();
            const usados = new Set([...fixos.values()].map((p) => p.getId()));

            for (const papel of ordem) {
                const lista = ranking.get(papel) ?? [];
                const inicio = Math.min(k, Math.max(lista.length - 1, 0));
                const candidato =
                    lista.slice(inicio).find((c) => !usados.has(c.profissional.getId())) ??
                    lista.find((c) => !usados.has(c.profissional.getId()));
                if (candidato) {
                    escolhidos.set(papel, candidato.profissional);
                    usados.add(candidato.profissional.getId());
                }
            }

            this.ajustarAoOrcamento(projeto, [...ordem].reverse(), ranking, escolhidos, fixos);

            const chave = [...escolhidos].map(([papel, p]) => `${papel}:${p.getId()}`).sort().join('|');
            if (escolhidos.size === 0 || composicoesVistas.has(chave)) continue;
            composicoesVistas.add(chave);

            const equipe = new Equipe();
            for (const [papel, profissional] of fixos) equipe.definirMembro(papel, profissional);
            for (const [papel, profissional] of escolhidos) equipe.definirMembro(papel, profissional);
            sugestoes.push(equipe);
        }
        return sugestoes;
    }

    /** Enquanto passar do orçamento, troca por alguém mais barato começando pelos papéis de menor peso. */
    private ajustarAoOrcamento(
        projeto: Projeto,
        papeisMenorPesoPrimeiro: readonly Papel[],
        ranking: Ranking,
        escolhidos: Map<Papel, Profissional>,
        fixos: ReadonlyMap<Papel, Profissional>
    ): void {
        const custo = (): number =>
            [...fixos.values(), ...escolhidos.values()].reduce((total, p) => total + p.getPrecoMedio(), 0);

        let trocou = true;
        while (custo() > projeto.getOrcamento() && trocou) {
            trocou = false;
            const usados = new Set([...fixos.values(), ...escolhidos.values()].map((p) => p.getId()));
            for (const papel of papeisMenorPesoPrimeiro) {
                const atual = escolhidos.get(papel);
                if (!atual) continue;
                const maisBarato = (ranking.get(papel) ?? []).find(
                    (c) => !usados.has(c.profissional.getId()) && c.profissional.getPrecoMedio() < atual.getPrecoMedio()
                );
                if (maisBarato) {
                    escolhidos.set(papel, maisBarato.profissional);
                    trocou = true;
                    break;
                }
            }
        }
    }
}
