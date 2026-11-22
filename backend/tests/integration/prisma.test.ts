import { PrismaClient as ClienteNotificacoes } from '#prisma/notificacoes';
import { PrismaClient as ClienteProfissionais } from '#prisma/profissionais';
import { PrismaClient as ClienteProjetos } from '#prisma/projetos';
import { PrismaClient as ClienteRecomendacoes } from '#prisma/recomendacoes';
import { describe, expect, it } from 'vitest';
import { Convite } from '../../src/domain/entities/Convite.js';
import { Recomendacao } from '../../src/domain/entities/Recomendacao.js';
import { Papel } from '../../src/domain/enums/Papel.js';
import { StatusConvite } from '../../src/domain/enums/StatusConvite.js';
import { LoggerMemoria } from '../../src/infrastructure/logging/LoggerMemoria.js';
import { ConviteRepositoryPrisma } from '../../src/infrastructure/repositories/prisma/ConviteRepositoryPrisma.js';
import { NotificacaoRepositoryPrisma } from '../../src/infrastructure/repositories/prisma/NotificacaoRepositoryPrisma.js';
import { ProfissionalRepositoryPrisma } from '../../src/infrastructure/repositories/prisma/ProfissionalRepositoryPrisma.js';
import { ProjetoRepositoryPrisma } from '../../src/infrastructure/repositories/prisma/ProjetoRepositoryPrisma.js';
import { RecomendacaoRepositoryPrisma } from '../../src/infrastructure/repositories/prisma/RecomendacaoRepositoryPrisma.js';
import { criarProfissional, criarProjeto } from '../fixtures/fabricas.js';

/**
 * Precisa de um PostgreSQL com os bancos profissionais, projetos, recomendacoes e notificacoes já migrados
 * (é o que o job "postgres" do CI faz). Rode com TESTAR_PRISMA=1 e, se preciso, PG_URL_BASE
 * (padrão postgresql://cinebridge:cinebridge@localhost:5432).
 */
const BASE = process.env['PG_URL_BASE'] ?? 'postgresql://cinebridge:cinebridge@localhost:5432';
const url = (banco: string) => `${BASE}/${banco}?schema=public`;

describe.skipIf(!process.env['TESTAR_PRISMA'])('Repositórios Prisma (um PostgreSQL por serviço)', () => {
    it('cada serviço grava e lê o próprio agregado, com profissionais como snapshot fora do serviço dono', async () => {
        const bancos = {
            profissionais: new ClienteProfissionais({ datasourceUrl: url('profissionais') }),
            projetos: new ClienteProjetos({ datasourceUrl: url('projetos') }),
            recomendacoes: new ClienteRecomendacoes({ datasourceUrl: url('recomendacoes') }),
            notificacoes: new ClienteNotificacoes({ datasourceUrl: url('notificacoes') })
        };
        try {
            const sufixo = Date.now().toString(36);
            const profissionais = new ProfissionalRepositoryPrisma(bancos.profissionais);
            const diretor = criarProfissional({ id: `it-d-${sufixo}`, competencias: { direcao: 9 } });
            const editor = criarProfissional({ id: `it-e-${sufixo}`, especialidades: [Papel.EDITOR] });
            await profissionais.salvar(diretor);
            await profissionais.salvarVarios([editor]);
            expect((await profissionais.buscarPorId(diretor.getId()))?.nivelEm('direcao')).toBe(9);
            const candidatos = await profissionais.buscarCandidatos({
                papeis: [Papel.EDITOR],
                disponivelEm: new Date('2027-06-01'),
                excluirIds: [diretor.getId()]
            });
            expect(candidatos.map((p) => p.getId())).toContain(editor.getId());

            const projetos = new ProjetoRepositoryPrisma(bancos.projetos);
            const projeto = criarProjeto({ id: `it-p-${sufixo}`, papeis: [[Papel.DIRETOR, 2], [Papel.EDITOR, 1]] });
            projeto.aceitarRecomendacao(Papel.DIRETOR, diretor);
            projeto.aceitarRecomendacao(Papel.EDITOR, editor);
            await projetos.salvar(projeto);
            const lido = await projetos.buscarPorId(projeto.getId());
            expect(lido?.getEquipe()?.obterMembro(Papel.EDITOR)?.getProfissional().nivelEm('direcao')).toBe(
                editor.nivelEm('direcao')
            );

            const convites = new ConviteRepositoryPrisma(bancos.projetos);
            const convite = new Convite({ projetoId: projeto.getId(), papel: Papel.EDITOR, profissional: editor });
            await convites.salvar(convite);
            convite.aceitar();
            await convites.salvar(convite);
            expect((await convites.buscarPorId(convite.getId()))?.getStatus()).toBe(StatusConvite.ACEITO);
            expect(await convites.listarPorProjeto(projeto.getId())).toHaveLength(1);

            const recomendacoes = new RecomendacaoRepositoryPrisma(bancos.recomendacoes);
            await recomendacoes.salvar(
                new Recomendacao({
                    projetoId: projeto.getId(),
                    estrategia: 'similaridade-cosseno',
                    ranking: new Map([[Papel.DIRETOR, [{ profissional: diretor, pontuacao: 0.9 }]]]),
                    parcial: false
                })
            );
            const [recomendacao] = await recomendacoes.listarPorProjeto(projeto.getId());
            expect(recomendacao?.melhorCandidato(Papel.DIRETOR)?.profissional.getNome()).toBe(diretor.getNome());

            const notificacoes = new NotificacaoRepositoryPrisma(bancos.notificacoes, new LoggerMemoria());
            await notificacoes.enviar({ para: 'x@y.z', assunto: 'Oi', corpo: 'Teste' });
            await notificacoes.entregar({ destinatarioId: `prod-${sufixo}`, titulo: 'Oi', texto: 'Teste', criadaEm: new Date() });
            expect(await notificacoes.listar(`prod-${sufixo}`)).toHaveLength(1);
        } finally {
            await Promise.all(Object.values(bancos).map((b) => b.$disconnect()));
        }
    });
});
