import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import type { Papel } from '../../domain/enums/Papel.js';

/**
 * Strategy: cada implementação encapsula um algoritmo de recomendação diferente.
 * Recebe o projeto e os candidatos e devolve, para cada papel do projeto, os profissionais
 * ordenados do melhor para o pior. As estratégias do sistema devolvem `RecomendacoesPorPapel`,
 * que além disso guarda a pontuação de cada um.
 */
export interface RecomendacaoStrategy {
    readonly nome: string;
    readonly descricao: string;

    recomendar(projeto: Projeto, profissionais: readonly Profissional[]): Map<Papel, Profissional[]>;
}
