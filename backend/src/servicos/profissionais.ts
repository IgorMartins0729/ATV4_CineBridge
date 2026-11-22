import { PrismaClient } from '#prisma/profissionais';
import { gerarProfissionais } from '../infrastructure/dados/geradorProfissionais.js';
import { atenderConsultasProfissionais } from '../infrastructure/remotos/profissionais.js';
import { ProfissionalRepositoryPrisma } from '../infrastructure/repositories/prisma/ProfissionalRepositoryPrisma.js';
import { iniciarServico } from './comum.js';

/**
 * cinebridge-profissionais (porta 3001): dono do cadastro de profissionais (profissionais-db).
 * Responde a fila "consulta-profissionais". Variáveis: DATABASE_URL, RABBITMQ_URL, PORT,
 * PROFISSIONAIS_SEED (quantos profissionais fictícios gerar se o banco estiver vazio; padrão 2000).
 */
iniciarServico('cinebridge-profissionais', 3001, async ({ logger, mensageria }) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    const repositorio = new ProfissionalRepositoryPrisma(prisma);

    const quantidade = Number(process.env['PROFISSIONAIS_SEED'] ?? 2_000);
    if (quantidade > 0 && (await repositorio.contar()) === 0) {
        logger.info('Banco vazio: gerando profissionais fictícios', { quantidade });
        await repositorio.salvarVarios(gerarProfissionais(quantidade));
    }

    await atenderConsultasProfissionais(mensageria, repositorio);
    return {
        verificacoes: { banco: () => prisma.$queryRawUnsafe('SELECT 1') },
        extrasSaude: async () => ({ profissionaisCadastrados: await repositorio.contar() }),
        encerrar: () => prisma.$disconnect()
    };
});
