import type { Avaliacao } from '../../domain/entities/Avaliacao.js';
import type { Profissional } from '../../domain/entities/Profissional.js';
import type { FiltroCandidatos } from './IProfissionalRepository.js';

/**
 * Adapter (alvo): contrato padronizado das fontes de cadastro de profissionais
 * (cadastro interno, LinkedIn, Indeed...). Cada fonte devolve o seu formato; o adaptador converte
 * para a entidade Profissional do domínio.
 */
export interface AdaptadorProfissional {
    readonly provedor: string;

    listarProfissionais(criterios: FiltroCandidatos): Promise<Profissional[]>;

    /** Lança NaoEncontradoError se o profissional não existir na fonte. */
    detalharProfissional(id: string): Promise<Profissional>;

    registrarAvaliacao(id: string, avaliacao: Avaliacao): Promise<void>;
}
