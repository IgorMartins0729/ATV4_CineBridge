import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarIdArquivo, type AdaptadorArmazenamento } from '../../src/application/ports/AdaptadorArmazenamento.js';
import type { AdaptadorPagamento } from '../../src/application/ports/AdaptadorPagamento.js';
import { carregarParametros } from '../../src/config/parametros.js';
import { Avaliacao } from '../../src/domain/entities/Avaliacao.js';
import type { Projeto } from '../../src/domain/entities/Projeto.js';
import { Papel } from '../../src/domain/enums/Papel.js';
import { ConflitoError, NaoEncontradoError, ValidacaoError } from '../../src/domain/erros.js';
import { AdaptadorGoogleCloud } from '../../src/infrastructure/adaptadores/armazenamento/AdaptadorGoogleCloud.js';
import { AdaptadorLocal } from '../../src/infrastructure/adaptadores/armazenamento/AdaptadorLocal.js';
import { AdaptadorS3 } from '../../src/infrastructure/adaptadores/armazenamento/AdaptadorS3.js';
import { AdaptadorPagSeguro } from '../../src/infrastructure/adaptadores/pagamento/AdaptadorPagSeguro.js';
import { AdaptadorPayPal } from '../../src/infrastructure/adaptadores/pagamento/AdaptadorPayPal.js';
import { AdaptadorStripe } from '../../src/infrastructure/adaptadores/pagamento/AdaptadorStripe.js';
import { AdaptadorIndeed } from '../../src/infrastructure/adaptadores/profissionais/AdaptadorIndeed.js';
import { AdaptadorInterno } from '../../src/infrastructure/adaptadores/profissionais/AdaptadorInterno.js';
import { AdaptadorLinkedIn } from '../../src/infrastructure/adaptadores/profissionais/AdaptadorLinkedIn.js';
import { ApiGoogleCloudStorageSimulada } from '../../src/infrastructure/externos/ApiGoogleCloudStorageSimulada.js';
import { ApiIndeedSimulada } from '../../src/infrastructure/externos/ApiIndeedSimulada.js';
import { ApiLinkedInSimulada } from '../../src/infrastructure/externos/ApiLinkedInSimulada.js';
import { ApiPagSeguroSimulada } from '../../src/infrastructure/externos/ApiPagSeguroSimulada.js';
import { ApiPayPalSimulada } from '../../src/infrastructure/externos/ApiPayPalSimulada.js';
import { ApiS3Simulada } from '../../src/infrastructure/externos/ApiS3Simulada.js';
import { ApiStripeSimulada } from '../../src/infrastructure/externos/ApiStripeSimulada.js';
import { ProfissionalRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/ProfissionalRepositoryMemoria.js';
import { criarProfissional, criarProjeto, HOJE } from '../fixtures/fabricas.js';
import { montarSistema } from '../fixtures/sistema.js';

let pastaLocal = '';
beforeAll(async () => {
    pastaLocal = await mkdtemp(path.join(os.tmpdir(), 'cinebridge-'));
});
afterAll(async () => {
    await rm(pastaLocal, { recursive: true, force: true });
});

const armazenamentos: Array<[string, () => AdaptadorArmazenamento]> = [
    ['S3', () => new AdaptadorS3(new ApiS3Simulada(2), 'midia')],
    ['Google Cloud', () => new AdaptadorGoogleCloud(new ApiGoogleCloudStorageSimulada())],
    ['Local', () => new AdaptadorLocal(path.join(pastaLocal, String(Math.random())))]
];

describe.each(armazenamentos)('Adapter de armazenamento: %s cumpre o contrato', (_nome, criar) => {
    it('salva, recupera e lista por prefixo (inclusive com várias páginas no S3)', async () => {
        const adaptador = criar();
        const roteiro = Buffer.from('INT. SET - DIA');
        const id = await adaptador.salvarArquivo(roteiro, { nome: 'roteiro v1.pdf', tipo: 'application/pdf', pasta: 'projetos/p1' });
        for (let i = 0; i < 4; i++) await adaptador.salvarArquivo(Buffer.from(`quadro ${i}`), { nome: `sb${i}.png`, pasta: 'projetos/p1' });
        await adaptador.salvarArquivo(Buffer.from('outro'), { nome: 'x.txt', pasta: 'projetos/p2' });

        expect(id).toMatch(/^projetos\/p1\/[0-9a-f-]{36}-roteiro_v1\.pdf$/);
        expect(await adaptador.recuperarArquivo(id)).toEqual(roteiro);
        const ids = await adaptador.listarArquivos('projetos/p1/');
        expect(ids).toHaveLength(5);
        expect(ids).toEqual([...ids].sort());
    });

    it('arquivo inexistente vira NaoEncontradoError, seja qual for o erro do provedor', async () => {
        await expect(criar().recuperarArquivo('projetos/p1/nao-existe.txt')).rejects.toThrow(NaoEncontradoError);
    });
});

describe('Adapter de armazenamento: segurança dos ids', () => {
    it('nome e pasta vindos de fora não escapam da pasta configurada', async () => {
        expect(() => gerarIdArquivo({ nome: 'a.txt', pasta: 'projetos/../../etc' }, 'u')).toThrow(ValidacaoError);
        expect(() => gerarIdArquivo({ nome: '  ' }, 'u')).toThrow(ValidacaoError);
        expect(gerarIdArquivo({ nome: '../senha', pasta: 'p' }, 'u')).toBe('p/u-.._senha');
        await expect(new AdaptadorLocal(pastaLocal).recuperarArquivo('../../segredo')).rejects.toThrow(ValidacaoError);
        expect(await new AdaptadorLocal(path.join(pastaLocal, 'vazia')).listarArquivos('')).toEqual([]);
    });
});

const pagamentos: Array<[string, () => AdaptadorPagamento]> = [
    ['Stripe', () => new AdaptadorStripe(new ApiStripeSimulada())],
    ['PagSeguro', () => new AdaptadorPagSeguro(new ApiPagSeguroSimulada())],
    ['PayPal', () => new AdaptadorPayPal(new ApiPayPalSimulada())]
];

describe.each(pagamentos)('Adapter de pagamento: %s cumpre o contrato', (_nome, criar) => {
    it('paga, consulta, estorna e recusa um segundo estorno', async () => {
        const gateway = criar();
        const id = await gateway.efetuarPagamento(1_234.56, 'produtor-1', 'prof-1');
        expect(await gateway.verificarPagamento(id)).toBe('APROVADO');
        expect(await gateway.cancelarPagamento(id)).toBe(true);
        expect(await gateway.verificarPagamento(id)).toBe('CANCELADO');
        expect(await gateway.cancelarPagamento(id)).toBe(false);
    });
});

describe('Adapter de pagamento: tradução de cada gateway', () => {
    it('Stripe recebe centavos inteiros e o cartão recusado vira RECUSADO', async () => {
        const stripe = new ApiStripeSimulada(50_000);
        const gateway = new AdaptadorStripe(stripe);
        const id = await gateway.efetuarPagamento(100.1, 'a', 'b');
        expect((await stripe.paymentIntents.retrieve(id)).amount).toBe(10_010);
        expect(await gateway.verificarPagamento(await gateway.efetuarPagamento(600, 'a', 'b'))).toBe('RECUSADO');
        expect(await gateway.cancelarPagamento('pi_inexistente')).toBe(false);
    });

    it('PagSeguro: código desconhecido é erro; PayPal: pedido sem captura não estorna', async () => {
        await expect(new AdaptadorPagSeguro(new ApiPagSeguroSimulada()).verificarPagamento('x')).rejects.toThrow(/desconhecida/);
        const paypal = new ApiPayPalSimulada();
        const pedido = await paypal.createOrder({
            intent: 'CAPTURE',
            payer_id: 'a',
            purchase_units: [{ amount: { currency_code: 'BRL', value: '10.00' }, payee: { merchant_id: 'b' } }]
        });
        const adaptador = new AdaptadorPayPal(paypal);
        expect(await adaptador.verificarPagamento(pedido.id)).toBe('PENDENTE');
        expect(await adaptador.cancelarPagamento(pedido.id)).toBe(false);
    });
});

describe('Adapter de profissionais: cada fonte vira a mesma entidade Profissional', () => {
    const criterios = { papeis: [Papel.DIRETOR, Papel.EDITOR], disponivelEm: HOJE };

    it('LinkedIn: cargos viram papéis, proficiência vira nível, recomendações viram avaliações', async () => {
        const linkedin = new AdaptadorLinkedIn(new ApiLinkedInSimulada());
        const lista = await linkedin.listarProfissionais(criterios);
        // O diretor de fotografia aparece na busca por "director", mas não é DIRETOR: o filtro do adaptador o tira.
        expect(lista.map((p) => p.getId()).sort()).toEqual(['linkedin:ACoAA1', 'linkedin:ACoAA3']);

        const helena = await linkedin.detalharProfissional('linkedin:ACoAA1');
        expect(helena.getEspecialidades()).toEqual([Papel.DIRETOR]);
        expect(helena.nivelEm('direcao')).toBe(9);
        expect(helena.getPrecoMedio()).toBe(21_000);

        await linkedin.registrarAvaliacao('linkedin:ACoAA1', new Avaliacao(2.4, 'atrasou', HOJE));
        expect((await linkedin.detalharProfissional('linkedin:ACoAA1')).getAvaliacoes()).toHaveLength(4);
        await expect(linkedin.detalharProfissional('indeed:js-901')).rejects.toThrow(NaoEncontradoError);
        await expect(linkedin.detalharProfissional('linkedin:nao-existe')).rejects.toThrow(NaoEncontradoError);
    });

    it('Indeed: centavos viram reais e "Cidade, UF" vira Localizacao', async () => {
        const indeed = new AdaptadorIndeed(new ApiIndeedSimulada());
        const [editor] = await indeed.listarProfissionais({ papeis: [Papel.EDITOR], precoMaximo: 7_000 });
        expect(editor?.getId()).toBe('indeed:js-903');
        expect(editor?.getPrecoMedio()).toBe(6_500);
        expect(editor?.getLocalizacao().getCidade()).toBe('Recife');
        expect(editor?.nivelEm('montagem')).toBe(6);

        await indeed.registrarAvaliacao('indeed:js-903', new Avaliacao(0, 'sem nota', HOJE));
        expect((await indeed.detalharProfissional('indeed:js-903')).getAvaliacoes().at(-1)?.getNota()).toBe(1);
        await expect(indeed.detalharProfissional('indeed:x')).rejects.toThrow(NaoEncontradoError);
    });

    it('Interno: usa o repositório e grava a avaliação nova (a entidade é imutável)', async () => {
        const repositorio = new ProfissionalRepositoryMemoria([criarProfissional({ id: 'i1', notas: [4] })]);
        const interno = new AdaptadorInterno(repositorio);
        await interno.registrarAvaliacao('i1', new Avaliacao(5, 'ótimo', HOJE));
        expect((await interno.detalharProfissional('i1')).mediaAvaliacoes()).toBe(4.5);
        await expect(interno.detalharProfissional('x')).rejects.toThrow(NaoEncontradoError);
    });
});

/** Projeto com equipe formada: diretor e editor confirmados. */
function projetoComEquipeFormada(): Projeto {
    const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 2], [Papel.EDITOR, 1]] });
    projeto.aceitarRecomendacao(Papel.DIRETOR, criarProfissional({ id: 'dir', preco: 30_000 }));
    projeto.aceitarRecomendacao(Papel.EDITOR, criarProfissional({ id: 'ed', especialidades: [Papel.EDITOR], preco: 9_999.999 }));
    const equipe = projeto.getEquipe()!;
    equipe.confirmarMembro(Papel.DIRETOR, 'dir');
    equipe.confirmarMembro(Papel.EDITOR, 'ed');
    equipe.formar(projeto.getPapeis(), HOJE);
    return projeto;
}

describe('Adapter no SistemaRecomendacao: trocar o provedor não muda a lógica de negócio', () => {
    it('paga a mesma equipe por Stripe, PagSeguro e PayPal só trocando o adaptador injetado', async () => {
        const { sistema } = montarSistema();
        const { armazenamento, profissional } = sistema.getAdaptadores();
        const resultados = [];
        for (const [, criar] of pagamentos) {
            sistema.configurarAdaptadores(armazenamento, criar(), profissional);
            resultados.push(await sistema.pagarEquipe(projetoComEquipeFormada()));
        }

        expect(resultados.map((r) => r.map((p) => p.provedor)[0])).toEqual(['stripe', 'pagseguro', 'paypal']);
        const semProvedor = resultados.map((r) => r.map(({ papel, profissionalId, valor, status }) => ({ papel, profissionalId, valor, status })));
        expect(semProvedor[1]).toEqual(semProvedor[0]);
        expect(semProvedor[2]).toEqual(semProvedor[0]);
        expect(semProvedor[0]).toEqual([
            { papel: Papel.DIRETOR, profissionalId: 'dir', valor: 30_000, status: 'APROVADO' },
            { papel: Papel.EDITOR, profissionalId: 'ed', valor: 10_000, status: 'APROVADO' }
        ]);
    });

    it('se um pagamento é recusado, os anteriores são estornados', async () => {
        const { sistema } = montarSistema();
        const estornados: string[] = [];
        // Gateway que aprova o 1º pagamento (diretor) e recusa o 2º (editor).
        const instavel: AdaptadorPagamento = {
            provedor: 'instavel',
            efetuarPagamento: async (_valor, _origem, destino) => `tx-${destino}`,
            verificarPagamento: async (id) => (id === 'tx-dir' ? 'APROVADO' : 'RECUSADO'),
            cancelarPagamento: async (id) => {
                estornados.push(id);
                return true;
            }
        };
        const { armazenamento, profissional } = sistema.getAdaptadores();
        sistema.configurarAdaptadores(armazenamento, instavel, profissional);

        await expect(sistema.pagarEquipe(projetoComEquipeFormada())).rejects.toThrow(/recusado pelo gateway instavel/);
        expect(estornados).toEqual(['tx-dir']);
    });

    it('estorna também o pagamento pendente e o cobrado cuja consulta de status falhou', async () => {
        const { sistema } = montarSistema();
        const estornados: string[] = [];
        // 1º (diretor) fica PENDENTE; o 2º (editor) é cobrado, mas a consulta do status cai.
        const instavel: AdaptadorPagamento = {
            provedor: 'instavel',
            efetuarPagamento: async (_valor, _origem, destino) => `tx-${destino}`,
            verificarPagamento: async (id) => {
                if (id === 'tx-dir') return 'PENDENTE';
                throw new Error('timeout na consulta');
            },
            cancelarPagamento: async (id) => {
                estornados.push(id);
                return true;
            }
        };
        const { armazenamento, profissional } = sistema.getAdaptadores();
        sistema.configurarAdaptadores(armazenamento, instavel, profissional);

        await expect(sistema.pagarEquipe(projetoComEquipeFormada())).rejects.toThrow(/timeout/);
        expect(estornados).toEqual(['tx-dir', 'tx-ed']);
    });

    it('não paga equipe que ainda não foi formada', async () => {
        const { sistema } = montarSistema();
        await expect(sistema.pagarEquipe(criarProjeto())).rejects.toThrow(ConflitoError);
    });

    it('guarda os arquivos do projeto em S3 ou Google Cloud com o mesmo código', async () => {
        const { sistema } = montarSistema();
        const { pagamento, profissional } = sistema.getAdaptadores();
        for (const [, criar] of armazenamentos.slice(0, 2)) {
            sistema.configurarAdaptadores(criar(), pagamento, profissional);
            const id = await sistema.anexarArquivo('p-1', Buffer.from('storyboard'), { nome: 'sb.png', tipo: 'image/png' });
            expect(await sistema.listarArquivos('p-1')).toEqual([id]);
            expect((await sistema.recuperarArquivo(id)).toString()).toBe('storyboard');
        }
    });

    it('recomenda com candidatos do LinkedIn trocando só a fonte de profissionais', async () => {
        const { sistema } = montarSistema({ profissionais: [criarProfissional({ id: 'interno-1' })] });
        const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 1]] });
        const interno = await sistema.executarRecomendacao(projeto);
        expect(interno.sugestoes[0]?.obterMembro(Papel.DIRETOR)?.getProfissional().getId()).toBe('interno-1');

        const { armazenamento, pagamento } = sistema.getAdaptadores();
        sistema.configurarAdaptadores(armazenamento, pagamento, new AdaptadorLinkedIn(new ApiLinkedInSimulada()));
        const externo = await sistema.executarRecomendacao(projeto);
        expect(externo.sugestoes[0]?.obterMembro(Papel.DIRETOR)?.getProfissional().getId()).toBe('linkedin:ACoAA1');

        await sistema.registrarAvaliacao('linkedin:ACoAA1', new Avaliacao(5, 'excelente', HOJE));
    });

    it('a configuração escolhe o provedor por variável de ambiente e recusa nomes desconhecidos', () => {
        const parametros = carregarParametros({ ARMAZENAMENTO: 'google-cloud', PAGAMENTO: 'paypal', FONTE_PROFISSIONAIS: 'indeed' });
        expect(parametros.integracoes).toMatchObject({ armazenamento: 'google-cloud', pagamento: 'paypal', profissionais: 'indeed' });
        expect(() => carregarParametros({ PAGAMENTO: 'boleto' })).toThrow(/PAGAMENTO inválido/);
    });
});
