import { PrismaClient } from '#prisma/projetos';
import { NaoEncontradoError } from '../domain/erros.js';
import { atenderComandosProjetos } from '../infrastructure/remotos/projetos.js';
import { ConviteRepositoryPrisma } from '../infrastructure/repositories/prisma/ConviteRepositoryPrisma.js';
import { ProjetoRepositoryPrisma } from '../infrastructure/repositories/prisma/ProjetoRepositoryPrisma.js';
import { projetoParaJson } from '../infrastructure/serializacao/json.js';
import { iniciarServico } from './comum.js';

/**
 * cinebridge-projetos (porta 3002): fonte de verdade de projetos, equipes e convites (projetos-db).
 * Atende "comandos-projetos" e publica o ciclo de vida em "eventos-projetos". Variáveis: DATABASE_URL, RABBITMQ_URL, PORT.
 */
iniciarServico('cinebridge-projetos', 3002, async ({ mensageria }) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    const projetos = new ProjetoRepositoryPrisma(prisma);
    const convites = new ConviteRepositoryPrisma(prisma);

    await atenderComandosProjetos(mensageria, projetos, convites);
    return {
        verificacoes: { banco: () => prisma.$queryRawUnsafe('SELECT 1') },
        // Consulta direta, para conferir que o projeto criado pela API foi registrado aqui.
        rotas: (app) => {
            app.get<{ Params: { id: string } }>('/projetos/:id', async (req) => {
                const projeto = await projetos.buscarPorId(req.params.id);
                if (!projeto) throw new NaoEncontradoError(`Projeto ${req.params.id} não encontrado`);
                return { ...projetoParaJson(projeto), convites: (await convites.listarPorProjeto(projeto.getId())).length };
            });
        },
        encerrar: () => prisma.$disconnect()
    };
});
