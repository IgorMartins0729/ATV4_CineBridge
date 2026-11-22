import type { Avaliacao } from '../../domain/entities/Avaliacao.js';
import type { Equipe } from '../../domain/entities/Equipe.js';
import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import { Recomendacao } from '../../domain/entities/Recomendacao.js';
import { criarEvento, TipoEvento, type Evento, type ResumoProfissional } from '../eventos/EventoRecomendacao.js';
import type { FabricaProjeto } from '../fabricas/FabricaProjeto.js';
import type { RegistroFabricas } from '../fabricas/RegistroFabricas.js';
import type { OpcoesOrquestracao, OrquestradorEquipe } from '../orquestrador/OrquestradorEquipe.js';
import type { AdaptadorArmazenamento, MetadadosArquivo } from '../ports/AdaptadorArmazenamento.js';
import type { AdaptadorPagamento } from '../ports/AdaptadorPagamento.js';
import type { AdaptadorProfissional } from '../ports/AdaptadorProfissional.js';
import type { IEventBus } from '../ports/IEventBus.js';
import type { ILogger } from '../ports/ILogger.js';
import type { IRecomendacaoRepository } from '../ports/IRecomendacaoRepository.js';
import { pagarEquipe, type PagamentoMembro } from '../services/pagamentoEquipe.js';
import type { OrigemDados, ProvedorProfissionais } from '../services/ProvedorProfissionais.js';
import type { RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy.js';
import type { RegistroEstrategias } from '../strategies/RegistroEstrategias.js';
import type { Observador } from './Observador.js';

/** Adapter: os três serviços externos, sempre pelas interfaces padronizadas. */
export interface Adaptadores {
    armazenamento: AdaptadorArmazenamento;
    pagamento: AdaptadorPagamento;
    profissional: AdaptadorProfissional;
}

export interface DependenciasSistema {
    adaptadores: Adaptadores;
    /**
     * Decorator: envolve a estratégia escolhida (cache, auditoria, compressão...) antes de usá-la.
     * Quais camadas e em que ordem é decidido fora daqui (configuração/preferência do produtor),
     * então mudar a pilha não exige alterar esta classe.
     */
    decorarEstrategia?: (estrategia: RecomendacaoStrategy, projeto: Projeto) => RecomendacaoStrategy;
    /** Fábricas de cada tipo de projeto (Abstract Factory). */
    fabricas: RegistroFabricas;
    /** Monta o orquestrador da rodada: a fábrica escolhida e os candidatos entram pelo construtor. */
    criarOrquestrador: (fabrica: FabricaProjeto, candidatos: readonly Profissional[]) => OrquestradorEquipe;
    provedor: ProvedorProfissionais;
    estrategias: RegistroEstrategias;
    eventBus: IEventBus;
    recomendacoes: IRecomendacaoRepository;
    logger: ILogger;
}

export interface ResultadoRecomendacao {
    recomendacao: Recomendacao;
    sugestoes: Equipe[];
    parcial: boolean;
    origemDados: OrigemDados;
}

const ORIGEM = 'SistemaRecomendacao';

function pastaDoProjeto(projetoId: string): string {
    return `projetos/${projetoId}`;
}

/**
 * Sujeito do padrão Observer e ponto de entrada do motor de recomendação.
 * Para cada solicitação identifica o tipo do projeto, escolhe a fábrica correspondente e usa
 * os objetos dela (orquestrador, validador, recomendador e notificador) na execução.
 */
export class SistemaRecomendacao {
    private readonly deps: DependenciasSistema;
    private readonly observadores = new Map<Observador, () => void>();
    private estrategiaAtual: RecomendacaoStrategy | null = null;
    private readonly recomendadoresFabrica = new WeakMap<FabricaProjeto, RecomendacaoStrategy>();
    private adaptadorArmazenamento!: AdaptadorArmazenamento;
    private adaptadorPagamento!: AdaptadorPagamento;
    private adaptadorProfissional!: AdaptadorProfissional;

    constructor(deps: DependenciasSistema) {
        this.deps = deps;
        const { armazenamento, pagamento, profissional } = deps.adaptadores;
        this.configurarAdaptadores(armazenamento, pagamento, profissional);
    }

    /** Troca os provedores externos em tempo de execução. A lógica de negócio não muda. */
    public configurarAdaptadores(
        armazenamento: AdaptadorArmazenamento,
        pagamento: AdaptadorPagamento,
        profissional: AdaptadorProfissional
    ): void {
        this.adaptadorArmazenamento = armazenamento;
        this.adaptadorPagamento = pagamento;
        this.adaptadorProfissional = profissional;
        if (this.deps.provedor.getFonte() !== profissional) {
            this.deps.provedor.trocarFonte(profissional);
        }
    }

    public getAdaptadores(): Adaptadores {
        return {
            armazenamento: this.adaptadorArmazenamento,
            pagamento: this.adaptadorPagamento,
            profissional: this.adaptadorProfissional
        };
    }

    /** Guarda um arquivo de mídia do projeto (roteiro, storyboard, amostra) no provedor configurado. */
    public anexarArquivo(projetoId: string, conteudo: Buffer, metadados: Omit<MetadadosArquivo, 'pasta'>): Promise<string> {
        return this.adaptadorArmazenamento.salvarArquivo(conteudo, { ...metadados, pasta: pastaDoProjeto(projetoId) });
    }

    public listarArquivos(projetoId: string): Promise<string[]> {
        return this.adaptadorArmazenamento.listarArquivos(`${pastaDoProjeto(projetoId)}/`);
    }

    public recuperarArquivo(id: string): Promise<Buffer> {
        return this.adaptadorArmazenamento.recuperarArquivo(id);
    }

    /** Paga a equipe formada pelo gateway configurado (regra em `pagamentoEquipe`). */
    public pagarEquipe(projeto: Projeto): Promise<PagamentoMembro[]> {
        return pagarEquipe(projeto, this.adaptadorPagamento);
    }

    /** Envia a avaliação do produtor para a fonte de cadastro do profissional. */
    public registrarAvaliacao(profissionalId: string, avaliacao: Avaliacao): Promise<void> {
        return this.adaptadorProfissional.registrarAvaliacao(profissionalId, avaliacao);
    }

    /** Estratégia usada para projetos que não escolheram uma. Aceita a instância ou o nome. */
    public definirEstrategia(estrategia: RecomendacaoStrategy | string): void {
        this.estrategiaAtual = typeof estrategia === 'string' ? this.deps.estrategias.obter(estrategia) : estrategia;
    }

    /** Busca uma estratégia pelo nome (lança ValidacaoError se não existir). */
    public obterEstrategia(nome: string): RecomendacaoStrategy {
        return this.deps.estrategias.obter(nome);
    }

    public getEstrategiaAtual(): RecomendacaoStrategy | null {
        return this.estrategiaAtual;
    }

    /** Fábrica do tipo do projeto (lança ValidacaoError se o tipo não tiver fábrica). */
    public fabricaPara(projeto: Projeto): FabricaProjeto {
        return this.deps.fabricas.paraProjeto(projeto);
    }

    /**
     * Ordem: estratégia do projeto > estratégia definida no sistema > orçamento reduzido > recomendador da fábrica do tipo.
     */
    public resolverEstrategia(projeto: Projeto): RecomendacaoStrategy {
        return this.estrategiaEscolhida(projeto) ?? this.recomendadorDaFabrica(this.fabricaPara(projeto));
    }

    /** Um recomendador por fábrica: a mesma instância permite reaproveitar a pilha de decoradores (e o cache). */
    private recomendadorDaFabrica(fabrica: FabricaProjeto): RecomendacaoStrategy {
        let recomendador = this.recomendadoresFabrica.get(fabrica);
        if (!recomendador) {
            recomendador = fabrica.criarRecomendador();
            this.recomendadoresFabrica.set(fabrica, recomendador);
        }
        return recomendador;
    }

    public adicionarObservador(observador: Observador): void {
        if (this.observadores.has(observador)) return;
        const cancelar = this.deps.eventBus.assinar('*', (evento) => observador.atualizar(evento));
        this.observadores.set(observador, cancelar);
    }

    public removerObservador(observador: Observador): void {
        this.observadores.get(observador)?.();
        this.observadores.delete(observador);
    }

    public getObservadores(): string[] {
        return [...this.observadores.keys()].map((o) => o.nome);
    }

    public async notificarObservadores(evento: Evento): Promise<void> {
        await this.deps.eventBus.publicar(evento);
    }

    public async executarRecomendacao(
        projeto: Projeto,
        opcoes: OpcoesOrquestracao = {}
    ): Promise<ResultadoRecomendacao> {
        const fabrica = this.fabricaPara(projeto);
        const papeis = opcoes.papeis ?? projeto.getPapeis();
        const excluidos = [...(opcoes.excluidos ?? [])];

        const busca = await this.deps.provedor.buscar({
            papeis,
            disponivelEm: projeto.getPrazo(),
            precoMaximo: projeto.getOrcamento(),
            excluirIds: excluidos
        });
        const estrategia = this.resolverEstrategia(projeto);
        const decorada = this.deps.decorarEstrategia?.(estrategia, projeto) ?? estrategia;
        const orquestrador = this.deps.criarOrquestrador(fabrica, busca.profissionais);
        orquestrador.orquestrar(projeto, decorada, { ...opcoes, papeis, excluidos });
        const resultado = orquestrador.getResultado();

        const parcial = busca.parcial || resultado.papeisSemCandidatos.length > 0;
        const recomendacao = new Recomendacao({
            projetoId: projeto.getId(),
            estrategia: resultado.estrategia.nome,
            ranking: resultado.ranking,
            parcial,
            papeisSemCandidatos: resultado.papeisSemCandidatos
        });
        await this.deps.recomendacoes.salvar(recomendacao);

        const evento = criarEvento(
            TipoEvento.RECOMENDACAO_GERADA,
            {
                recomendacaoId: recomendacao.getId(),
                projetoId: projeto.getId(),
                titulo: projeto.getTitulo(),
                produtor: projeto.getProdutor(),
                tipoProjeto: projeto.getTipo(),
                especificos: projeto.getEspecificos(),
                estrategia: resultado.estrategia.nome,
                parcial,
                papeis: [...papeis],
                recomendados: this.recomendados(resultado.sugestoes, opcoes)
            },
            ORIGEM
        );
        await this.notificarObservadores(evento);
        await this.notificarPeloTipo(fabrica, evento);

        return { recomendacao, sugestoes: resultado.sugestoes, parcial, origemDados: busca.origem };
    }

    /** Estratégia escolhida explicitamente (ou pelo orçamento). Null = o orquestrador usa a da fábrica. */
    private estrategiaEscolhida(projeto: Projeto): RecomendacaoStrategy | null {
        const doProjeto = projeto.getEstrategia();
        if (doProjeto) {
            return this.deps.estrategias.obter(doProjeto);
        }
        return this.estrategiaAtual ?? this.deps.estrategias.paraOrcamentoReduzido(projeto);
    }

    /** O notificador do tipo envia o resumo no formato do projeto. Uma falha nele não derruba a recomendação. */
    private async notificarPeloTipo(fabrica: FabricaProjeto, evento: Evento): Promise<void> {
        const notificador = fabrica.criarNotificador();
        try {
            await notificador.atualizar(evento);
        } catch (erro) {
            this.deps.logger.error('Falha no notificador do tipo de projeto', {
                notificador: notificador.nome,
                erro: erro instanceof Error ? erro.message : String(erro)
            });
        }
    }

    /** Profissionais novos que aparecem nas sugestões (os fixos já foram avisados antes). */
    private recomendados(sugestoes: readonly Equipe[], opcoes: OpcoesOrquestracao): ResumoProfissional[] {
        const fixos = new Set([...(opcoes.fixos?.values() ?? [])].map((p) => p.getId()));
        const resumo = new Map<string, ResumoProfissional>();
        for (const equipe of sugestoes) {
            for (const membro of equipe.getMembros()) {
                const p = membro.getProfissional();
                if (fixos.has(p.getId()) || resumo.has(p.getId())) continue;
                resumo.set(p.getId(), { id: p.getId(), nome: p.getNome(), email: p.getEmail(), papel: membro.getPapel() });
            }
        }
        return [...resumo.values()];
    }
}
