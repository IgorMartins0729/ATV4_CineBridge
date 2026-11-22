import { createHash } from 'node:crypto';
import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import { RecomendacoesPorPapel } from '../../../domain/entities/Recomendacao.js';
import type { RecomendacaoStrategy } from '../RecomendacaoStrategy.js';
import { RecomendadorDecorator } from './RecomendadorDecorator.js';

export interface ConfigCache {
    /** Validade de uma entrada. Limita o tempo em que um dado alterado do profissional pode ficar desatualizado. */
    ttlMs: number;
    /** Máximo de entradas; acima disso sai a usada há mais tempo (LRU). */
    capacidade: number;
}

export const CONFIG_CACHE_PADRAO: ConfigCache = { ttlMs: 60_000, capacidade: 500 };

/**
 * Chave de "projetos similares": tudo o que as estratégias leem do projeto e os candidatos recebidos.
 * Id, título e produtor ficam de fora: dois projetos com as mesmas características recebem a mesma resposta.
 * Os candidatos entram na chave para que rejeitados/excluídos (outra lista) nunca recebam um resultado antigo.
 */
export function chaveRecomendacao(projeto: Projeto, profissionais: readonly Profissional[]): string {
    const caracteristicas = {
        tipo: projeto.getTipo(),
        especificos: projeto.getEspecificos(),
        genero: projeto.getGenero(),
        duracao: projeto.getDuracao(),
        captacao: projeto.getTipoCaptacao(),
        orcamento: projeto.getOrcamento(),
        prazo: projeto.getPrazo().toISOString(),
        local: projeto.getLocalizacao().toString(),
        papeis: projeto.getPapeisObrigatorios().map((r) => [r.getPapel(), r.getPeso()]),
        candidatos: profissionais.map((p) => p.getId()).sort()
    };
    return createHash('sha256').update(JSON.stringify(caracteristicas)).digest('hex');
}

/** Decorator: devolve o resultado guardado quando a mesma requisição já foi processada há pouco tempo. */
export class CacheDecorator extends RecomendadorDecorator {
    private readonly config: ConfigCache;
    private readonly relogio: () => number;
    private readonly entradas = new Map<string, { valor: RecomendacoesPorPapel; expiraEm: number }>();
    private acertos = 0;
    private falhas = 0;

    constructor(interno: RecomendacaoStrategy, config: Partial<ConfigCache> = {}, relogio: () => number = Date.now) {
        super(interno);
        this.config = { ...CONFIG_CACHE_PADRAO, ...config };
        this.relogio = relogio;
    }

    public recomendar(projeto: Projeto, profissionais: readonly Profissional[]): RecomendacoesPorPapel {
        const chave = chaveRecomendacao(projeto, profissionais);
        const agora = this.relogio();
        const entrada = this.entradas.get(chave);
        if (entrada && entrada.expiraEm > agora) {
            this.acertos++;
            // Reinsere para marcar como usada recentemente (o Map mantém a ordem de inserção).
            this.entradas.delete(chave);
            this.entradas.set(chave, entrada);
            return RecomendacoesPorPapel.de(entrada.valor);
        }

        this.falhas++;
        const valor = RecomendacoesPorPapel.de(this.interno.recomendar(projeto, profissionais));
        this.entradas.delete(chave);
        this.entradas.set(chave, { valor, expiraEm: agora + this.config.ttlMs });
        if (this.entradas.size > this.config.capacidade) {
            const maisAntiga = this.entradas.keys().next().value;
            if (maisAntiga !== undefined) this.entradas.delete(maisAntiga);
        }
        // Cópia: quem recebe pode alterar o Map sem estragar o que está guardado.
        return RecomendacoesPorPapel.de(valor);
    }

    public estatisticas(): { acertos: number; falhas: number; entradas: number } {
        return { acertos: this.acertos, falhas: this.falhas, entradas: this.entradas.size };
    }
}
