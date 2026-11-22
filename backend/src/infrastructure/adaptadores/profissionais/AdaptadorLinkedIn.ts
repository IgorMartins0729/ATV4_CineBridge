import type { AdaptadorProfissional } from '../../../application/ports/AdaptadorProfissional.js';
import { atendeFiltro, type FiltroCandidatos } from '../../../application/ports/IProfissionalRepository.js';
import { Avaliacao } from '../../../domain/entities/Avaliacao.js';
import { Profissional } from '../../../domain/entities/Profissional.js';
import { NaoEncontradoError } from '../../../domain/erros.js';
import { FaixaPreco } from '../../../domain/value-objects/FaixaPreco.js';
import { Intervalo } from '../../../domain/value-objects/Intervalo.js';
import { Localizacao } from '../../../domain/value-objects/Localizacao.js';
import { ErroLinkedIn, type ApiLinkedInSimulada, type PerfilLinkedIn, type Proficiencia } from '../../externos/ApiLinkedInSimulada.js';
import { competencias, estrelas, idExterno, papeisDosCargos, TERMO_BUSCA_POR_PAPEL } from './traducao.js';

const PREFIXO = 'linkedin';
const NIVEL: Readonly<Record<Proficiencia, number>> = { BEGINNER: 3, INTERMEDIATE: 5, ADVANCED: 7, EXPERT: 9 };

/** Adapter: converte perfis do LinkedIn (cargos, proficiência em texto, recomendações) em Profissional. */
export class AdaptadorLinkedIn implements AdaptadorProfissional {
    readonly provedor = PREFIXO;
    private readonly api: ApiLinkedInSimulada;

    constructor(api: ApiLinkedInSimulada) {
        this.api = api;
    }

    public async listarProfissionais(criterios: FiltroCandidatos): Promise<Profissional[]> {
        // O LinkedIn só filtra por cargo; disponibilidade, preço e exclusões são aplicados aqui.
        const perfis = await this.api.buscarProfissionais({ titles: criterios.papeis.map((p) => TERMO_BUSCA_POR_PAPEL[p]) });
        return perfis.flatMap((perfil) => this.converter(perfil) ?? []).filter((p) => atendeFiltro(p, criterios));
    }

    public async detalharProfissional(id: string): Promise<Profissional> {
        const perfil = await this.perfil(id);
        const profissional = this.converter(perfil);
        if (!profissional) throw new NaoEncontradoError(`Perfil ${id} não tem um papel técnico reconhecido`);
        return profissional;
    }

    public async registrarAvaliacao(id: string, avaliacao: Avaliacao): Promise<void> {
        const perfil = await this.perfil(id);
        await this.api.avaliarProfissional(perfil.id, estrelas(avaliacao.getNota()));
    }

    private async perfil(id: string): Promise<PerfilLinkedIn> {
        const externo = idExterno(PREFIXO, id);
        if (!externo) throw new NaoEncontradoError(`Profissional ${id} não é do LinkedIn`);
        try {
            return await this.api.obterPerfil(externo);
        } catch (erro) {
            if (erro instanceof ErroLinkedIn && erro.status === 404) throw new NaoEncontradoError(`Profissional ${id} não encontrado`);
            throw erro;
        }
    }

    /** null quando nenhum cargo corresponde a um papel do CineBridge. */
    private converter(perfil: PerfilLinkedIn): Profissional | null {
        const especialidades = papeisDosCargos(perfil.positions.map((p) => p.title));
        if (especialidades.length === 0) return null;
        return new Profissional({
            id: `${PREFIXO}:${perfil.id}`,
            nome: `${perfil.localizedFirstName} ${perfil.localizedLastName}`,
            email: perfil.emailAddress,
            especialidades,
            competencias: competencias(perfil.skills.map((s) => ({ nome: s.name, nivel: NIVEL[s.proficiency] }))),
            avaliacoes: perfil.recommendations.map((nota) => new Avaliacao(nota, 'Recomendação no LinkedIn', new Date(0))),
            faixaPreco: new FaixaPreco(perfil.projectRate.min, perfil.projectRate.max),
            disponibilidade: new Intervalo(new Date(perfil.openToWork.from), new Date(perfil.openToWork.until)),
            localizacao: new Localizacao(perfil.location.city, perfil.location.region)
        });
    }
}
