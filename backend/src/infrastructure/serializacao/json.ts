import { Avaliacao } from '../../domain/entities/Avaliacao.js';
import { Competencia } from '../../domain/entities/Competencia.js';
import { Convite } from '../../domain/entities/Convite.js';
import { Equipe } from '../../domain/entities/Equipe.js';
import { MembroEquipe } from '../../domain/entities/MembroEquipe.js';
import { Profissional } from '../../domain/entities/Profissional.js';
import type { EspecificosProjeto, Projeto } from '../../domain/entities/Projeto.js';
import { restaurarProjeto } from '../../domain/entities/projetos/restaurarProjeto.js';
import type { Papel } from '../../domain/enums/Papel.js';
import type { StatusConvite } from '../../domain/enums/StatusConvite.js';
import type { StatusEquipe } from '../../domain/enums/StatusEquipe.js';
import type { TipoCaptacao } from '../../domain/enums/TipoCaptacao.js';
import type { TipoProjeto } from '../../domain/enums/TipoProjeto.js';
import { servicoDeJson, servicoParaJson, type ServicoJson } from '../../domain/servicos/serializacao.js';
import { FaixaPreco } from '../../domain/value-objects/FaixaPreco.js';
import { Intervalo } from '../../domain/value-objects/Intervalo.js';
import { Localizacao } from '../../domain/value-objects/Localizacao.js';
import type { ProjetoAnterior } from '../../domain/value-objects/ProjetoAnterior.js';
import type { Produtor } from '../../domain/value-objects/Produtor.js';

/**
 * Formato JSON das entidades que atravessam a fronteira entre microsserviços (mensagens no RabbitMQ)
 * e das cópias (snapshots) guardadas em JSONB. Datas viajam como texto ISO.
 */

export interface ProfissionalJson {
    id: string;
    nome: string;
    email: string;
    especialidades: Papel[];
    competencias: Array<{ nome: string; nivel: number }>;
    avaliacoes: Array<{ nota: number; comentario: string; data: string }>;
    historico: ProjetoAnterior[];
    precoMinimo: number;
    precoMaximo: number;
    disponivelDe: string;
    disponivelAte: string;
    cidade: string;
    uf: string;
}

export interface ProjetoJson {
    id: string;
    tipo: TipoProjeto;
    especificos: EspecificosProjeto;
    titulo: string;
    produtor: Produtor;
    genero: string;
    duracao: number;
    orcamento: number;
    prazo: string;
    tipoCaptacao: TipoCaptacao;
    cidade: string;
    uf: string;
    servicos: ServicoJson;
    estrategia: string | null;
    rejeitados: string[];
    equipe: {
        id: string;
        status: StatusEquipe;
        dataFormacao: string | null;
        membros: Array<{ papel: Papel; profissional: ProfissionalJson; confirmado: boolean }>;
    } | null;
}

export interface ConviteJson {
    id: string;
    projetoId: string;
    papel: Papel;
    profissional: ProfissionalJson;
    status: StatusConvite;
    criadoEm: string;
    respondidoEm: string | null;
}

export function profissionalParaJson(p: Profissional): ProfissionalJson {
    return {
        id: p.getId(),
        nome: p.getNome(),
        email: p.getEmail(),
        especialidades: [...p.getEspecialidades()],
        competencias: p.getCompetencias().map((c) => ({ nome: c.getNome(), nivel: c.getNivel() })),
        avaliacoes: p.getAvaliacoes().map((a) => ({ nota: a.getNota(), comentario: a.getComentario(), data: a.getData().toISOString() })),
        historico: [...p.getHistoricoProjetos()],
        precoMinimo: p.getFaixaPreco().getMinimo(),
        precoMaximo: p.getFaixaPreco().getMaximo(),
        disponivelDe: p.getDisponibilidade().getInicio().toISOString(),
        disponivelAte: p.getDisponibilidade().getFim().toISOString(),
        cidade: p.getLocalizacao().getCidade(),
        uf: p.getLocalizacao().getUf()
    };
}

export function profissionalDeJson(j: ProfissionalJson): Profissional {
    return new Profissional({
        id: j.id,
        nome: j.nome,
        email: j.email,
        especialidades: j.especialidades,
        competencias: j.competencias.map((c) => new Competencia(c.nome, c.nivel)),
        avaliacoes: j.avaliacoes.map((a) => new Avaliacao(a.nota, a.comentario, new Date(a.data))),
        historicoProjetos: j.historico,
        faixaPreco: new FaixaPreco(j.precoMinimo, j.precoMaximo),
        disponibilidade: new Intervalo(new Date(j.disponivelDe), new Date(j.disponivelAte)),
        localizacao: new Localizacao(j.cidade, j.uf)
    });
}

export function projetoParaJson(projeto: Projeto): ProjetoJson {
    const equipe = projeto.getEquipe();
    return {
        id: projeto.getId(),
        tipo: projeto.getTipo(),
        especificos: projeto.getEspecificos(),
        titulo: projeto.getTitulo(),
        produtor: { ...projeto.getProdutor() },
        genero: projeto.getGenero(),
        duracao: projeto.getDuracao(),
        orcamento: projeto.getOrcamento(),
        prazo: projeto.getPrazo().toISOString(),
        tipoCaptacao: projeto.getTipoCaptacao(),
        cidade: projeto.getLocalizacao().getCidade(),
        uf: projeto.getLocalizacao().getUf(),
        servicos: servicoParaJson(projeto.getServicoPrincipal()),
        estrategia: projeto.getEstrategia(),
        rejeitados: [...projeto.getProfissionaisRejeitados()],
        equipe: equipe
            ? {
                  id: equipe.getId(),
                  status: equipe.getStatus(),
                  dataFormacao: equipe.getDataFormacao()?.toISOString() ?? null,
                  membros: equipe.getMembros().map((m) => ({
                      papel: m.getPapel(),
                      profissional: profissionalParaJson(m.getProfissional()),
                      confirmado: m.getConfirmado()
                  }))
              }
            : null
    };
}

export function projetoDeJson(j: ProjetoJson): Projeto {
    const equipe = j.equipe
        ? new Equipe(
              j.equipe.id,
              j.equipe.membros.map((m) => new MembroEquipe(m.papel, profissionalDeJson(m.profissional), m.confirmado)),
              j.equipe.status,
              j.equipe.dataFormacao ? new Date(j.equipe.dataFormacao) : null
          )
        : null;
    return restaurarProjeto(
        j.tipo,
        {
            id: j.id,
            titulo: j.titulo,
            produtor: j.produtor,
            genero: j.genero,
            duracao: j.duracao,
            orcamento: j.orcamento,
            prazo: new Date(j.prazo),
            tipoCaptacao: j.tipoCaptacao,
            localizacao: new Localizacao(j.cidade, j.uf),
            servicoPrincipal: servicoDeJson(j.servicos),
            estrategia: j.estrategia,
            equipe,
            profissionaisRejeitados: j.rejeitados
        },
        j.especificos
    );
}

export function conviteParaJson(c: Convite): ConviteJson {
    return {
        id: c.getId(),
        projetoId: c.getProjetoId(),
        papel: c.getPapel(),
        profissional: profissionalParaJson(c.getProfissional()),
        status: c.getStatus(),
        criadoEm: c.getCriadoEm().toISOString(),
        respondidoEm: c.getRespondidoEm()?.toISOString() ?? null
    };
}

export function conviteDeJson(j: ConviteJson): Convite {
    return new Convite({
        id: j.id,
        projetoId: j.projetoId,
        papel: j.papel,
        profissional: profissionalDeJson(j.profissional),
        status: j.status,
        criadoEm: new Date(j.criadoEm),
        respondidoEm: j.respondidoEm ? new Date(j.respondidoEm) : null
    });
}
