import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import { rotuloPapel } from '../../domain/enums/Papel.js';
import type { ServicoProjeto } from '../../domain/servicos/ServicoProjeto.js';
import type { VisitanteProjeto } from '../../domain/visitors/VisitanteProjeto.js';
import { CalculadorCompatibilidade } from './CalculadorCompatibilidade.js';
import { formatarData, formatarMoeda } from './formatacao.js';
import { ValidadorConsistencia } from './ValidadorConsistencia.js';
import type { ValidadorProjeto } from './ValidadorProjeto.js';

/** Problemas de consistência geral (equipe, orçamento) somados aos do tipo de projeto. */
export function verificarConsistencia(projeto: Projeto, validadorDoTipo: ValidadorProjeto | null): string[] {
    const geral = new ValidadorConsistencia();
    projeto.aceitar(geral);
    const doTipo = validadorDoTipo && !projeto.aceitar(validadorDoTipo) ? validadorDoTipo.getProblemas() : [];
    return [...geral.getProblemas(), ...doTipo];
}

/** Composite: a mesma chamada percorre pacotes e serviços atômicos, em qualquer profundidade. */
function linhasServico(servico: ServicoProjeto, nivel: number): string[] {
    const linha = `${'  '.repeat(nivel)}- ${servico.nome}: ${formatarMoeda(servico.calcularCusto())}, ${servico.obterPrazo()} dias`;
    return [linha, ...servico.listarSubservicos().flatMap((s) => linhasServico(s, nivel + 1))];
}

/**
 * Visitante que gera um relatório em texto para o produtor. Reaproveita os outros dois visitantes.
 * As subclasses (uma por tipo de projeto, criadas pelas fábricas) acrescentam métricas próprias em `secaoDoTipo`.
 */
export class GeradorRelatorio implements VisitanteProjeto<string> {
    private readonly validadorDoTipo: ValidadorProjeto | null;

    /** @param validadorDoTipo regras do tipo de projeto, somadas à verificação de consistência geral. */
    constructor(validadorDoTipo: ValidadorProjeto | null = null) {
        this.validadorDoTipo = validadorDoTipo;
    }

    /** Linhas extras do relatório para o tipo de projeto (padrão: nenhuma). */
    protected secaoDoTipo(_projeto: Projeto): string[] {
        return [];
    }

    /** Nível médio (0 a 10) da equipe atual em uma competência; null se ainda não há equipe. */
    protected mediaDaEquipe(projeto: Projeto, competencia: string): number | null {
        const membros = projeto.getEquipe()?.getMembros() ?? [];
        if (membros.length === 0) return null;
        return membros.reduce((soma, m) => soma + m.getProfissional().nivelEm(competencia), 0) / membros.length;
    }

    public visitarProjeto(projeto: Projeto): string {
        const equipe = projeto.getEquipe();
        const especificos = Object.entries(projeto.getEspecificos())
            .map(([campo, valor]) => `${campo}: ${Array.isArray(valor) ? valor.join(', ') || '-' : valor}`)
            .join(' | ');
        const linhas = [
            `RELATÓRIO DO PROJETO: ${projeto.getTitulo()}`,
            `Tipo: ${projeto.getTipo()}${especificos ? ` | ${especificos}` : ''}`,
            `Produtor(a): ${projeto.getProdutor().nome} <${projeto.getProdutor().email}>`,
            `Gênero: ${projeto.getGenero()} | Captação: ${projeto.getTipoCaptacao()} | Duração: ${projeto.getDuracao()} min`,
            `Orçamento: ${formatarMoeda(projeto.getOrcamento())} | Entrega: ${formatarData(projeto.getPrazo())} | Local: ${projeto.getLocalizacao().toString()}`,
            `Estratégia: ${projeto.getEstrategia() ?? 'automática'}`,
            '',
            `SERVIÇOS (custo estimado ${formatarMoeda(projeto.calcularCustoTotal())} | ${projeto.getServicoPrincipal().obterPrazo()} dias)`,
            ...linhasServico(projeto.getServicoPrincipal(), 0),
            '',
            `EQUIPE (${equipe ? equipe.getStatus() : 'sem equipe'})`
        ];

        for (const requisito of projeto.getPapeisObrigatorios()) {
            const membro = equipe?.obterMembro(requisito.getPapel());
            const cabecalho = `- ${rotuloPapel(requisito.getPapel())} (peso ${requisito.getPeso()}): `;
            if (!membro) {
                linhas.push(`${cabecalho}VAGO`);
                continue;
            }
            const situacao = membro.getConfirmado() ? 'confirmado' : 'aguardando confirmação';
            linhas.push(`${cabecalho}${membro.getProfissional().aceitar(this)} [${situacao}]`);
        }

        const secao = this.secaoDoTipo(projeto);
        if (secao.length > 0) {
            linhas.push('', `MÉTRICAS DO TIPO (${projeto.getTipo()})`, ...secao);
        }

        const problemas = verificarConsistencia(projeto, this.validadorDoTipo);
        linhas.push(
            '',
            `Custo total: ${formatarMoeda(equipe?.custoTotal() ?? 0)}`,
            `Compatibilidade geral: ${projeto.aceitar(new CalculadorCompatibilidade())}/100`,
            `Consistência: ${problemas.length === 0 ? 'OK' : 'com problemas'}`,
            ...problemas.map((problema) => `  ! ${problema}`)
        );
        return linhas.join('\n');
    }

    public visitarProfissional(profissional: Profissional): string {
        const competencias = [...profissional.getCompetencias()]
            .sort((a, b) => b.getNivel() - a.getNivel())
            .slice(0, 3)
            .map((c) => `${c.getNome()} ${c.getNivel()}`)
            .join(', ');
        return (
            `${profissional.getNome()} (${profissional.getLocalizacao().toString()}) · ` +
            `${formatarMoeda(profissional.getPrecoMedio())} · ` +
            `avaliação ${profissional.mediaAvaliacoes().toFixed(1)}/5 (${profissional.getAvaliacoes().length}) · ` +
            `principais competências: ${competencias || 'nenhuma'}`
        );
    }
}
