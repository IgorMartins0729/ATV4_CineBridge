import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TipoEvento } from '../../src/application/eventos/EventoRecomendacao.js';
import { NotificadorProjetos } from '../../src/application/observers/NotificadorProjetos.js';
import { FILAS } from '../../src/application/ports/IMensageria.js';
import { criarContainer } from '../../src/config/container.js';
import { gerarProfissionais } from '../../src/infrastructure/dados/geradorProfissionais.js';
import { buildApp } from '../../src/infrastructure/http/app.js';
import { LoggerMemoria } from '../../src/infrastructure/logging/LoggerMemoria.js';
import { MensageriaMemoria } from '../../src/infrastructure/mensageria/MensageriaMemoria.js';
import { CaixaMensagensMemoria } from '../../src/infrastructure/notificacoes/CaixaMensagensMemoria.js';
import { EnviadorEmailSimulado } from '../../src/infrastructure/notificacoes/EnviadorEmailSimulado.js';
import { atenderNotificacoes, CaixaMensagensRemota, EnviadorEmailRemoto } from '../../src/infrastructure/remotos/notificacoes.js';
import { atenderConsultasProfissionais, ProfissionalRepositoryRemoto } from '../../src/infrastructure/remotos/profissionais.js';
import { atenderComandosProjetos, ConviteRepositoryRemoto, ProjetoRepositoryRemoto } from '../../src/infrastructure/remotos/projetos.js';
import { ConviteRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/ConviteRepositoryMemoria.js';
import { ProfissionalRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/ProfissionalRepositoryMemoria.js';
import { ProjetoRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/ProjetoRepositoryMemoria.js';
import { HOJE } from '../fixtures/fabricas.js';

const PRODUTOR = { id: 'prod-mq', nome: 'Paula Lima', email: 'paula@produtora.com' };

/**
 * Os quatro microsserviços no mesmo processo, ligados só pela mensageria (em memória, com as mensagens
 * passando por JSON como na rede). A API não tem acesso direto aos dados dos outros serviços.
 */
async function subirPlataforma() {
    const mensageria = new MensageriaMemoria();
    const logger = new LoggerMemoria();

    // cinebridge-profissionais
    await atenderConsultasProfissionais(mensageria, new ProfissionalRepositoryMemoria(gerarProfissionais(400, { semente: 3, referencia: HOJE })));
    // cinebridge-projetos
    const projetos = new ProjetoRepositoryMemoria();
    await atenderComandosProjetos(mensageria, projetos, new ConviteRepositoryMemoria());
    // cinebridge-notificacoes
    const email = new EnviadorEmailSimulado(logger);
    const caixa = new CaixaMensagensMemoria();
    await atenderNotificacoes(mensageria, { email, mensagens: caixa }, [new NotificadorProjetos(email, caixa)]);
    // cinebridge-api
    const container = criarContainer({
        relogio: () => HOJE,
        logger,
        repositorios: {
            profissionais: new ProfissionalRepositoryRemoto(mensageria),
            projetos: new ProjetoRepositoryRemoto(mensageria),
            convites: new ConviteRepositoryRemoto(mensageria)
        },
        canais: { email: new EnviadorEmailRemoto(mensageria), mensagens: new CaixaMensagensRemota(mensageria) },
        verificacoesSaude: { mensageria: () => mensageria.verificar() }
    });
    const api = buildApp(container);
    return { api, mensageria, projetos, email, caixa };
}

let api: FastifyInstance | null = null;
afterEach(async () => {
    await api?.close();
    api = null;
});

describe('ATV IV: microsserviços conversando pela mensageria', () => {
    it('recomendação, registro do projeto, convites, equipe formada e notificações passam todos pelas filas', async () => {
        const plataforma = await subirPlataforma();
        api = plataforma.api;

        const criado = await api.inject({
            method: 'POST',
            url: '/projetos/recomendacoes',
            payload: {
                titulo: 'Curta distribuído',
                produtor: PRODUTOR,
                orcamento: 600_000,
                prazo: '2027-06-30',
                localizacao: { cidade: 'Recife', uf: 'PE' },
                papeisObrigatorios: [
                    { papel: 'DIRETOR', peso: 3 },
                    { papel: 'EDITOR', peso: 1 }
                ]
            }
        });
        expect(criado.statusCode).toBe(201);
        const { projeto, equipeRecomendada } = criado.json();
        expect(equipeRecomendada.membros).toHaveLength(2); // profissionais vieram do outro serviço

        // O projeto foi registrado no cinebridge-projetos, que publicou PROJETO_CRIADO; o notificações avisou o produtor.
        expect(await plataforma.projetos.buscarPorId(projeto.id)).not.toBeNull();
        const titulos = (await plataforma.caixa.listar(PRODUTOR.id)).map((m) => m.titulo);
        expect(titulos).toContain('Projeto registrado');
        // Os observadores da API publicaram os e-mails de interesse; quem enviou foi o cinebridge-notificacoes.
        expect(plataforma.email.getEnviados().some((m) => m.assunto.includes('interesse'))).toBe(true);

        for (const papel of ['DIRETOR', 'EDITOR']) {
            const convite = (await api.inject({ method: 'POST', url: `/projetos/${projeto.id}/membros/${papel}/aceitar` })).json();
            const resposta = await api.inject({ method: 'POST', url: `/convites/${convite.id}/resposta`, payload: { aceito: true } });
            expect(resposta.json().status).toBe('ACEITO');
        }
        const final = (await api.inject({ method: 'GET', url: `/projetos/${projeto.id}` })).json();
        expect(final.equipe.status).toBe('FORMADA');
        expect((await api.inject({ method: 'GET', url: `/projetos/${projeto.id}/convites` })).json()).toHaveLength(2);

        // Aceite de convite e projeto finalizado também viraram notificações.
        const emails = plataforma.email.getEnviados().map((m) => m.assunto);
        expect(emails.some((a) => a.includes('aceitou o convite'))).toBe(true);
        expect(emails).toContain('Projeto finalizado: Curta distribuído');

        // A caixa interna mora no cinebridge-notificacoes; a API consulta por RPC.
        const mensagens = (await api.inject({ method: 'GET', url: `/mensagens/${PRODUTOR.id}` })).json();
        expect(mensagens.map((m: { titulo: string }) => m.titulo)).toContain('Projeto finalizado');
        expect(plataforma.mensageria.falhas).toEqual([]); // nenhum consumidor falhou no caminho
    });

    it('falha no consumidor não volta para quem publicou (como no RabbitMQ)', async () => {
        const mensageria = new MensageriaMemoria();
        await mensageria.consumir('fila', async () => {
            throw new Error('consumidor caiu');
        });
        await expect(mensageria.publicar('fila', { a: 1 })).resolves.toBeUndefined();
        expect(mensageria.falhas).toHaveLength(1);
    });

    it('erros de domínio atravessam a fila com o mesmo status HTTP', async () => {
        const plataforma = await subirPlataforma();
        api = plataforma.api;
        expect((await api.inject({ method: 'GET', url: '/projetos/nao-existe' })).statusCode).toBe(404);
        expect((await api.inject({ method: 'GET', url: '/convites/nao-existe' })).statusCode).toBe(404);
        await expect(plataforma.mensageria.requisitar(FILAS.comandosProjetos, { operacao: 'apagarTudo' })).rejects.toThrow(
            /Operação desconhecida/
        );
        await expect(plataforma.mensageria.requisitar(FILAS.consultaProfissionais, { operacao: 'x' })).rejects.toThrow(/desconhecida/);
        await expect(plataforma.mensageria.requisitar(FILAS.consultaNotificacoes, { operacao: 'x' })).rejects.toThrow(/desconhecida/);
        await expect(plataforma.mensageria.requisitar('fila-sem-ninguem', { operacao: 'x' })).rejects.toThrow(/Ninguém responde/);
    });

    it('/health responde 200 com as dependências e 503 quando o RabbitMQ cai', async () => {
        const plataforma = await subirPlataforma();
        api = plataforma.api;
        const ok = await api.inject({ method: 'GET', url: '/health' });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({ status: 'ok', dependencias: { mensageria: 'ok' } });

        await plataforma.mensageria.encerrar();
        const fora = await api.inject({ method: 'GET', url: '/health' });
        expect(fora.statusCode).toBe(503);
        expect(fora.json().status).toBe('indisponivel');
    });

    it('evento publicado antes do consumidor existir fica na fila durável e é entregue depois', async () => {
        const mensageria = new MensageriaMemoria();
        await mensageria.publicar(FILAS.eventosProjetos, {
            tipo: TipoEvento.PROJETO_CRIADO,
            dados: { projetoId: 'p1', titulo: 'Atrasado', produtor: PRODUTOR, tipoProjeto: 'GERAL' },
            origem: 'cinebridge-projetos',
            ocorridoEm: HOJE.toISOString()
        });
        const caixa = new CaixaMensagensMemoria();
        const email = new EnviadorEmailSimulado(new LoggerMemoria());
        await atenderNotificacoes(mensageria, { email, mensagens: caixa }, [new NotificadorProjetos(email, caixa)]);
        const [mensagem] = await caixa.listar(PRODUTOR.id);
        expect(mensagem?.texto).toBe('O projeto "Atrasado" foi registrado.');
        expect(mensagem?.criadaEm).toEqual(HOJE);
        expect(email.getEnviados()).toHaveLength(1);
    });
});
