import { PERFIS_POR_PAPEL, type PerfilCompetencias } from '../../../domain/catalogo/perfisCompetencia.js';
import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import type { RecomendacoesPorPapel } from '../../../domain/entities/Recomendacao.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy.js';
import { SimilaridadeCosseno, type ConfigSimilaridadeCosseno } from '../../strategies/SimilaridadeCosseno.js';

/**
 * Base dos recomendadores de cada tipo: reaproveita a similaridade de cosseno,
 * trocando o perfil ideal dos papéis pelo perfil que o tipo de projeto valoriza.
 */
export abstract class RecomendadorPorPerfil implements RecomendacaoStrategy {
    public abstract readonly nome: string;
    public abstract readonly descricao: string;
    private readonly motor: SimilaridadeCosseno;

    constructor(
        perfisDoTipo: Partial<Record<Papel, PerfilCompetencias>>,
        config: Partial<Omit<ConfigSimilaridadeCosseno, 'perfis'>> = {}
    ) {
        this.motor = new SimilaridadeCosseno({ ...config, perfis: { ...PERFIS_POR_PAPEL, ...perfisDoTipo } });
    }

    public recomendar(projeto: Projeto, profissionais: readonly Profissional[]): RecomendacoesPorPapel {
        return this.motor.recomendar(projeto, profissionais);
    }
}
