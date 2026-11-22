import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import { RecomendacoesPorPapel, type Ranking } from '../../domain/entities/Recomendacao.js';
import type { RecomendacaoStrategy } from './RecomendacaoStrategy.js';

/**
 * Componente concreto do Decorator: a lógica principal de recomendação da ATV I.
 * Cada algoritmo (cosseno, colaborativa, orçamento) só calcula o ranking por papel;
 * a conversão para o Map do diagrama, com a pontuação de cada candidato, fica aqui.
 *
 * Cache, auditoria e compressão NÃO entram nesta hierarquia: são decoradores que envolvem
 * qualquer RecomendacaoStrategy (ver `decoradores/`), sem criar uma subclasse por combinação.
 */
export abstract class RecomendadorBase implements RecomendacaoStrategy {
    public abstract readonly nome: string;
    public abstract readonly descricao: string;

    public recomendar(projeto: Projeto, profissionais: readonly Profissional[]): RecomendacoesPorPapel {
        return RecomendacoesPorPapel.deRanking(this.rankear(projeto, profissionais));
    }

    /** Candidatos de cada papel do projeto, do melhor para o pior, com pontuação de 0 a 1. */
    protected abstract rankear(projeto: Projeto, profissionais: readonly Profissional[]): Ranking;
}
