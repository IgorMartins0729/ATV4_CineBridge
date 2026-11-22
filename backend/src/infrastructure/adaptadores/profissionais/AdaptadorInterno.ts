import type { AdaptadorProfissional } from '../../../application/ports/AdaptadorProfissional.js';
import type { FiltroCandidatos, IProfissionalRepository } from '../../../application/ports/IProfissionalRepository.js';
import type { Avaliacao } from '../../../domain/entities/Avaliacao.js';
import { Profissional } from '../../../domain/entities/Profissional.js';
import { NaoEncontradoError } from '../../../domain/erros.js';

/** Adapter para o cadastro próprio do CineBridge (repositório em memória ou PostgreSQL). */
export class AdaptadorInterno implements AdaptadorProfissional {
    readonly provedor = 'interno';
    private readonly repositorio: IProfissionalRepository;

    constructor(repositorio: IProfissionalRepository) {
        this.repositorio = repositorio;
    }

    public listarProfissionais(criterios: FiltroCandidatos): Promise<Profissional[]> {
        return this.repositorio.buscarCandidatos(criterios);
    }

    public async detalharProfissional(id: string): Promise<Profissional> {
        const profissional = await this.repositorio.buscarPorId(id);
        if (!profissional) throw new NaoEncontradoError(`Profissional ${id} não encontrado`);
        return profissional;
    }

    /** Profissional é imutável: grava uma cópia com a avaliação nova. */
    public async registrarAvaliacao(id: string, avaliacao: Avaliacao): Promise<void> {
        const p = await this.detalharProfissional(id);
        await this.repositorio.salvar(
            new Profissional({
                id: p.getId(),
                nome: p.getNome(),
                email: p.getEmail(),
                especialidades: [...p.getEspecialidades()],
                competencias: [...p.getCompetencias()],
                avaliacoes: [...p.getAvaliacoes(), avaliacao],
                historicoProjetos: [...p.getHistoricoProjetos()],
                faixaPreco: p.getFaixaPreco(),
                disponibilidade: p.getDisponibilidade(),
                localizacao: p.getLocalizacao()
            })
        );
    }
}
