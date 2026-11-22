import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Papel } from '../../domain/enums/Papel.js';

/** Filtro aplicado já na fonte de dados, para não carregar os 10 mil profissionais a cada pedido. */
export interface FiltroCandidatos {
    /** Profissionais com ao menos uma dessas especialidades. */
    papeis: readonly Papel[];
    /** Precisa estar disponível nesta data (data de entrega do projeto). */
    disponivelEm?: Date;
    /** Preço médio máximo aceito. */
    precoMaximo?: number;
    excluirIds?: readonly string[];
}

/** O filtro aplicado em memória (repositório em memória e fontes externas que não filtram tudo na origem). */
export function atendeFiltro(profissional: Profissional, filtro: FiltroCandidatos): boolean {
    if (filtro.excluirIds?.includes(profissional.getId())) return false;
    if (!filtro.papeis.some((papel) => profissional.possuiEspecialidade(papel))) return false;
    if (filtro.disponivelEm && !profissional.estaDisponivelEm(filtro.disponivelEm)) return false;
    if (filtro.precoMaximo !== undefined && profissional.getPrecoMedio() > filtro.precoMaximo) return false;
    return true;
}

export interface IProfissionalRepository {
    listarTodos(): Promise<Profissional[]>;

    buscarPorId(id: string): Promise<Profissional | null>;

    buscarCandidatos(filtro: FiltroCandidatos): Promise<Profissional[]>;

    salvar(profissional: Profissional): Promise<void>;

    contar(): Promise<number>;
}
