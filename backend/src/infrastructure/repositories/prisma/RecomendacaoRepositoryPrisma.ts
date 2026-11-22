import type { $Enums, Prisma, PrismaClient } from '#prisma/recomendacoes';
import type { IRecomendacaoRepository } from '../../../application/ports/IRecomendacaoRepository.js';
import { Recomendacao, type Ranking } from '../../../domain/entities/Recomendacao.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import { profissionalDeJson, profissionalParaJson, type ProfissionalJson } from '../../serializacao/json.js';

/** Snapshot do ranking: guarda os dados do profissional na época (o cadastro dele mora em outro serviço). */
type RankingJson = Record<string, Array<{ profissional: ProfissionalJson; pontuacao: number }>>;

export class RecomendacaoRepositoryPrisma implements IRecomendacaoRepository {
    constructor(private readonly prisma: PrismaClient) {}

    public async salvar(recomendacao: Recomendacao): Promise<void> {
        const ranking: RankingJson = {};
        for (const papel of recomendacao.getPapeis()) {
            ranking[papel] = recomendacao.getCandidatos(papel).map((c) => ({
                profissional: profissionalParaJson(c.profissional),
                pontuacao: c.pontuacao
            }));
        }
        await this.prisma.recomendacao.create({
            data: {
                id: recomendacao.getId(),
                projetoId: recomendacao.getProjetoId(),
                estrategia: recomendacao.getEstrategia(),
                parcial: recomendacao.isParcial(),
                papeisSemCandidatos: recomendacao.getPapeisSemCandidatos() as unknown as $Enums.Papel[],
                ranking: ranking as unknown as Prisma.InputJsonObject,
                geradaEm: recomendacao.getGeradaEm()
            }
        });
    }

    public async listarPorProjeto(projetoId: string): Promise<Recomendacao[]> {
        const linhas = await this.prisma.recomendacao.findMany({ where: { projetoId }, orderBy: { geradaEm: 'asc' } });
        return linhas.map((linha) => {
            const ranking: Ranking = new Map();
            for (const [papel, lista] of Object.entries(linha.ranking as unknown as RankingJson)) {
                ranking.set(
                    papel as Papel,
                    lista.map((item) => ({ profissional: profissionalDeJson(item.profissional), pontuacao: item.pontuacao }))
                );
            }
            return new Recomendacao({
                id: linha.id,
                projetoId: linha.projetoId,
                estrategia: linha.estrategia,
                ranking,
                parcial: linha.parcial,
                papeisSemCandidatos: linha.papeisSemCandidatos as unknown as Papel[],
                geradaEm: linha.geradaEm
            });
        });
    }
}
