import type { $Enums, Prisma, PrismaClient } from '#prisma/projetos';
import type { IProjetoRepository } from '../../../application/ports/IProjetoRepository.js';
import { Equipe } from '../../../domain/entities/Equipe.js';
import { MembroEquipe } from '../../../domain/entities/MembroEquipe.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import { restaurarProjeto } from '../../../domain/entities/projetos/restaurarProjeto.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { StatusEquipe } from '../../../domain/enums/StatusEquipe.js';
import type { TipoCaptacao } from '../../../domain/enums/TipoCaptacao.js';
import type { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { servicoDeJson, servicoParaJson } from '../../../domain/servicos/serializacao.js';
import { Localizacao } from '../../../domain/value-objects/Localizacao.js';
import { profissionalDeJson, profissionalParaJson, type ProfissionalJson } from '../../serializacao/json.js';

const INCLUIR_PROJETO = { equipe: { include: { membros: true } } } satisfies Prisma.ProjetoInclude;

type ProjetoCompleto = Prisma.ProjetoGetPayload<{ include: typeof INCLUIR_PROJETO }>;

/** Os enums do Prisma e do domínio têm os mesmos valores; só o tipo TypeScript é diferente. */
const papelPrisma = (papel: Papel): $Enums.Papel => papel as unknown as $Enums.Papel;

export class ProjetoRepositoryPrisma implements IProjetoRepository {
    constructor(private readonly prisma: PrismaClient) {}

    public async buscarPorId(id: string): Promise<Projeto | null> {
        const linha = await this.prisma.projeto.findUnique({ where: { id }, include: INCLUIR_PROJETO });
        return linha ? this.paraProjeto(linha) : null;
    }

    /** Grava o agregado inteiro (projeto, papéis, equipe e membros) em uma transação. */
    public async salvar(projeto: Projeto): Promise<void> {
        const id = projeto.getId();
        const produtor = projeto.getProdutor();
        const dados = {
            tipoProjeto: projeto.getTipo() as unknown as $Enums.TipoProjeto,
            especificos: projeto.getEspecificos() as Prisma.InputJsonObject,
            servicos: servicoParaJson(projeto.getServicoPrincipal()) as unknown as Prisma.InputJsonObject,
            titulo: projeto.getTitulo(),
            produtorId: produtor.id,
            produtorNome: produtor.nome,
            produtorEmail: produtor.email,
            genero: projeto.getGenero(),
            duracao: projeto.getDuracao(),
            orcamento: projeto.getOrcamento(),
            prazo: projeto.getPrazo(),
            tipoCaptacao: projeto.getTipoCaptacao() as unknown as $Enums.TipoCaptacao,
            cidade: projeto.getLocalizacao().getCidade(),
            uf: projeto.getLocalizacao().getUf(),
            estrategia: projeto.getEstrategia(),
            rejeitados: [...projeto.getProfissionaisRejeitados()]
        };

        await this.prisma.$transaction(async (tx) => {
            await tx.projeto.upsert({ where: { id }, create: { id, ...dados }, update: dados });
            await tx.requisitoPapel.deleteMany({ where: { projetoId: id } });
            await tx.requisitoPapel.createMany({
                data: projeto.getPapeisObrigatorios().map((r) => ({ projetoId: id, papel: papelPrisma(r.getPapel()), peso: r.getPeso() }))
            });

            const equipe = projeto.getEquipe();
            if (!equipe) {
                await tx.equipe.deleteMany({ where: { projetoId: id } });
                return;
            }
            await tx.equipe.deleteMany({ where: { projetoId: id, NOT: { id: equipe.getId() } } });
            const dadosEquipe = {
                status: equipe.getStatus() as unknown as $Enums.StatusEquipe,
                dataFormacao: equipe.getDataFormacao()
            };
            await tx.equipe.upsert({
                where: { id: equipe.getId() },
                create: { id: equipe.getId(), projetoId: id, ...dadosEquipe },
                update: dadosEquipe
            });
            await tx.membroEquipe.deleteMany({ where: { equipeId: equipe.getId() } });
            await tx.membroEquipe.createMany({
                data: equipe.getMembros().map((m) => ({
                    equipeId: equipe.getId(),
                    papel: papelPrisma(m.getPapel()),
                    profissionalId: m.getProfissional().getId(),
                    profissional: profissionalParaJson(m.getProfissional()) as unknown as Prisma.InputJsonObject,
                    confirmado: m.getConfirmado()
                }))
            });
        });
    }

    private paraProjeto(linha: ProjetoCompleto): Projeto {
        const equipe = linha.equipe
            ? new Equipe(
                  linha.equipe.id,
                  linha.equipe.membros.map(
                      (m) =>
                          new MembroEquipe(
                              m.papel as unknown as Papel,
                              profissionalDeJson(m.profissional as unknown as ProfissionalJson),
                              m.confirmado
                          )
                  ),
                  linha.equipe.status as unknown as StatusEquipe,
                  linha.equipe.dataFormacao
              )
            : null;
        return restaurarProjeto(
            linha.tipoProjeto as unknown as TipoProjeto,
            {
                id: linha.id,
                titulo: linha.titulo,
                produtor: { id: linha.produtorId, nome: linha.produtorNome, email: linha.produtorEmail },
                genero: linha.genero,
                duracao: linha.duracao,
                orcamento: linha.orcamento,
                prazo: linha.prazo,
                tipoCaptacao: linha.tipoCaptacao as unknown as TipoCaptacao,
                localizacao: new Localizacao(linha.cidade, linha.uf),
                servicoPrincipal: servicoDeJson(linha.servicos),
                estrategia: linha.estrategia,
                equipe,
                profissionaisRejeitados: linha.rejeitados
            },
            (linha.especificos ?? {}) as Record<string, unknown>
        );
    }
}
