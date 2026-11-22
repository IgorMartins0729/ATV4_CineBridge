import type { $Enums, Convite as LinhaConvite, Prisma, PrismaClient } from '#prisma/projetos';
import type { IConviteRepository } from '../../../application/ports/IConviteRepository.js';
import { Convite } from '../../../domain/entities/Convite.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { StatusConvite } from '../../../domain/enums/StatusConvite.js';
import { profissionalDeJson, profissionalParaJson, type ProfissionalJson } from '../../serializacao/json.js';

export class ConviteRepositoryPrisma implements IConviteRepository {
    constructor(private readonly prisma: PrismaClient) {}

    public async salvar(convite: Convite): Promise<void> {
        const dados = {
            status: convite.getStatus() as unknown as $Enums.StatusConvite,
            respondidoEm: convite.getRespondidoEm()
        };
        await this.prisma.convite.upsert({
            where: { id: convite.getId() },
            create: {
                id: convite.getId(),
                projetoId: convite.getProjetoId(),
                papel: convite.getPapel() as unknown as $Enums.Papel,
                profissionalId: convite.getProfissional().getId(),
                profissional: profissionalParaJson(convite.getProfissional()) as unknown as Prisma.InputJsonObject,
                criadoEm: convite.getCriadoEm(),
                ...dados
            },
            update: dados
        });
    }

    public async buscarPorId(id: string): Promise<Convite | null> {
        const linha = await this.prisma.convite.findUnique({ where: { id } });
        return linha ? paraConvite(linha) : null;
    }

    public async listarPorProjeto(projetoId: string): Promise<Convite[]> {
        const linhas = await this.prisma.convite.findMany({ where: { projetoId }, orderBy: { criadoEm: 'asc' } });
        return linhas.map(paraConvite);
    }
}

function paraConvite(linha: LinhaConvite): Convite {
    return new Convite({
        id: linha.id,
        projetoId: linha.projetoId,
        papel: linha.papel as unknown as Papel,
        profissional: profissionalDeJson(linha.profissional as unknown as ProfissionalJson),
        status: linha.status as unknown as StatusConvite,
        criadoEm: linha.criadoEm,
        respondidoEm: linha.respondidoEm
    });
}
