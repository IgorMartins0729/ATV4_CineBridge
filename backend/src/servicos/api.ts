import { PrismaClient } from '#prisma/recomendacoes';
import type { ILogger } from '../application/ports/ILogger.js';
import type { OpcoesContainer } from '../config/container.js';
import { CaixaMensagensRemota, EnviadorEmailRemoto } from '../infrastructure/remotos/notificacoes.js';
import { ProfissionalRepositoryRemoto } from '../infrastructure/remotos/profissionais.js';
import { ConviteRepositoryRemoto, ProjetoRepositoryRemoto } from '../infrastructure/remotos/projetos.js';
import { RecomendacaoRepositoryPrisma } from '../infrastructure/repositories/prisma/RecomendacaoRepositoryPrisma.js';
import { conectarMensageria } from './comum.js';

/**
 * Modo microsserviço do cinebridge-api: as regras de negócio (ATV I a III) não mudam, só os adaptadores.
 * Profissionais, projetos e convites viram adaptadores RPC sobre o RabbitMQ; e-mail e mensagens internas
 * viram publicações na fila do cinebridge-notificacoes; as recomendações ficam no banco próprio (recomendacoes-db).
 * Devolve a função que fecha as conexões.
 */
export async function configurarMicrosservico(opcoes: OpcoesContainer, logger: ILogger): Promise<() => Promise<void>> {
    const mensageria = await conectarMensageria(logger);
    const prisma = new PrismaClient();
    await prisma.$connect();

    opcoes.repositorios = {
        profissionais: new ProfissionalRepositoryRemoto(mensageria),
        projetos: new ProjetoRepositoryRemoto(mensageria),
        convites: new ConviteRepositoryRemoto(mensageria),
        recomendacoes: new RecomendacaoRepositoryPrisma(prisma)
    };
    opcoes.canais = { email: new EnviadorEmailRemoto(mensageria), mensagens: new CaixaMensagensRemota(mensageria) };
    opcoes.verificacoesSaude = {
        banco: () => prisma.$queryRawUnsafe('SELECT 1'),
        mensageria: () => mensageria.verificar()
    };
    return async () => {
        await mensageria.encerrar();
        await prisma.$disconnect();
    };
}
