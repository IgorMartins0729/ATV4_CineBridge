import { atendeFiltro, type FiltroCandidatos, type IProfissionalRepository } from '../../../application/ports/IProfissionalRepository.js';
import type { Profissional } from '../../../domain/entities/Profissional.js';

export class ProfissionalRepositoryMemoria implements IProfissionalRepository {
    private readonly profissionais = new Map<string, Profissional>();

    constructor(iniciais: readonly Profissional[] = []) {
        for (const profissional of iniciais) {
            this.profissionais.set(profissional.getId(), profissional);
        }
    }

    public async listarTodos(): Promise<Profissional[]> {
        return [...this.profissionais.values()];
    }

    public async buscarPorId(id: string): Promise<Profissional | null> {
        return this.profissionais.get(id) ?? null;
    }

    public async buscarCandidatos(filtro: FiltroCandidatos): Promise<Profissional[]> {
        // shortcut: excluirIds.includes é O(n) por profissional; ok para as poucas exclusões de um projeto.
        return [...this.profissionais.values()].filter((p) => atendeFiltro(p, filtro));
    }

    public async salvar(profissional: Profissional): Promise<void> {
        this.profissionais.set(profissional.getId(), profissional);
    }

    public async contar(): Promise<number> {
        return this.profissionais.size;
    }
}
