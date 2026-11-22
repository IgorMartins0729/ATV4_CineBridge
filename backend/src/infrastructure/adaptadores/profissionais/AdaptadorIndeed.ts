import type { AdaptadorProfissional } from '../../../application/ports/AdaptadorProfissional.js';
import { atendeFiltro, type FiltroCandidatos } from '../../../application/ports/IProfissionalRepository.js';
import { Avaliacao } from '../../../domain/entities/Avaliacao.js';
import { Profissional } from '../../../domain/entities/Profissional.js';
import { NaoEncontradoError } from '../../../domain/erros.js';
import { FaixaPreco } from '../../../domain/value-objects/FaixaPreco.js';
import { Intervalo } from '../../../domain/value-objects/Intervalo.js';
import { Localizacao } from '../../../domain/value-objects/Localizacao.js';
import type { ApiIndeedSimulada, CandidatoIndeed } from '../../externos/ApiIndeedSimulada.js';
import { competencias, estrelas, idExterno, papeisDosCargos, TERMO_BUSCA_POR_PAPEL } from './traducao.js';

const PREFIXO = 'indeed';
/** O Indeed não informa o nível das habilidades: assume um nível intermediário. */
const NIVEL_PADRAO = 6;

/** Adapter: converte candidatos do Indeed (centavos, "Cidade, UF", habilidades sem nível) em Profissional. */
export class AdaptadorIndeed implements AdaptadorProfissional {
    readonly provedor = PREFIXO;
    private readonly api: ApiIndeedSimulada;

    constructor(api: ApiIndeedSimulada) {
        this.api = api;
    }

    public async listarProfissionais(criterios: FiltroCandidatos): Promise<Profissional[]> {
        const q = criterios.papeis.map((p) => TERMO_BUSCA_POR_PAPEL[p]).join(' OR ');
        const { results } = await this.api.search({ q });
        return results.flatMap((c) => this.converter(c) ?? []).filter((p) => atendeFiltro(p, criterios));
    }

    public async detalharProfissional(id: string): Promise<Profissional> {
        const profissional = this.converter(await this.candidato(id));
        if (!profissional) throw new NaoEncontradoError(`Candidato ${id} não tem um papel técnico reconhecido`);
        return profissional;
    }

    public async registrarAvaliacao(id: string, avaliacao: Avaliacao): Promise<void> {
        const candidato = await this.candidato(id);
        await this.api.postReview(candidato.jobseekerKey, { stars: estrelas(avaliacao.getNota()), text: avaliacao.getComentario() });
    }

    private async candidato(id: string): Promise<CandidatoIndeed> {
        const externo = idExterno(PREFIXO, id);
        const candidato = externo ? await this.api.getJobseeker(externo) : null;
        if (!candidato) throw new NaoEncontradoError(`Profissional ${id} não encontrado no Indeed`);
        return candidato;
    }

    private converter(c: CandidatoIndeed): Profissional | null {
        const especialidades = papeisDosCargos([c.desiredTitle]);
        if (especialidades.length === 0) return null;
        const [cidade = '', uf = ''] = c.location.split(',').map((parte) => parte.trim());
        const valor = c.salaryExpectation.amountCents / 100;
        return new Profissional({
            id: `${PREFIXO}:${c.jobseekerKey}`,
            nome: c.fullName,
            email: c.email,
            especialidades,
            competencias: competencias(c.skillTags.map((nome) => ({ nome, nivel: NIVEL_PADRAO }))),
            avaliacoes: c.reviews.map((r) => new Avaliacao(r.stars, r.text, new Date(r.date))),
            faixaPreco: new FaixaPreco(valor, valor),
            disponibilidade: new Intervalo(new Date(c.availableFrom), new Date(c.availableTo)),
            localizacao: new Localizacao(cidade, uf)
        });
    }
}
