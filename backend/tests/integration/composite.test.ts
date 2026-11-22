import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { PROTOTIPOS } from '../../src/application/prototipos/catalogoPrototipos.js';
import { GeradorRelatorio } from '../../src/application/visitors/GeradorRelatorio.js';
import { criarContainer } from '../../src/config/container.js';
import { Projeto } from '../../src/domain/entities/Projeto.js';
import { Papel } from '../../src/domain/enums/Papel.js';
import { TipoCaptacao } from '../../src/domain/enums/TipoCaptacao.js';
import { RestricaoInvalidaError, ValidacaoError } from '../../src/domain/erros.js';
import { PacoteServico } from '../../src/domain/servicos/PacoteServico.js';
import { servicoDeJson, servicoParaJson } from '../../src/domain/servicos/serializacao.js';
import { ServicoAtomico } from '../../src/domain/servicos/ServicoAtomico.js';
import type { ServicoProjeto } from '../../src/domain/servicos/ServicoProjeto.js';
import { Localizacao } from '../../src/domain/value-objects/Localizacao.js';
import { gerarProfissionais } from '../../src/infrastructure/dados/geradorProfissionais.js';
import { buildApp } from '../../src/infrastructure/http/app.js';
import { criarProfissional, HOJE, PRAZO_PADRAO } from '../fixtures/fabricas.js';
import { montarSistema } from '../fixtures/sistema.js';

const at = (nome: string, papel: Papel, custo: number, prazo: number, peso = 1) =>
    new ServicoAtomico({ nome, papel, custo, prazo, peso });
const seq = (nome: string, ...filhos: ServicoProjeto[]) => new PacoteServico({ nome, subservicos: filhos });
const par = (nome: string, ...filhos: ServicoProjeto[]) => new PacoteServico({ nome, subservicos: filhos, paralelo: true });

function projetoCom(servicoPrincipal: ServicoProjeto, ajustes: { orcamento?: number; prazo?: Date } = {}): Projeto {
    return new Projeto({
        titulo: 'Curta',
        produtor: { id: 'prod-1', nome: 'Ana', email: 'ana@produtora.test' },
        genero: 'drama',
        duracao: 20,
        orcamento: ajustes.orcamento ?? 200_000,
        prazo: ajustes.prazo ?? PRAZO_PADRAO,
        tipoCaptacao: TipoCaptacao.FICCAO,
        localizacao: new Localizacao('Recife', 'PE'),
        servicoPrincipal
    });
}

/** Pós-produção do enunciado: edição, coloração, mixagem e efeitos, cada um decomposto em subserviços. */
function posProducao(): PacoteServico {
    return seq(
        'Pós-produção',
        seq('Edição', at('Montagem bruta', Papel.EDITOR, 6_000, 10), at('Corte final', Papel.EDITOR, 4_000, 5)),
        par(
            'Acabamento',
            at('Coloração', Papel.EDITOR, 5_000, 7),
            seq('Áudio', at('Edição de som', Papel.SONOPLASTA, 3_000, 4), at('Mixagem', Papel.SONOPLASTA, 4_000, 6)),
            at('Efeitos visuais', Papel.EFEITOS_VISUAIS, 9_000, 12, 2)
        )
    );
}

describe('Composite: serviços atômicos e pacotes tratados pela mesma interface', () => {
    it('um serviço atômico é uma folha com custo, prazo e papel', () => {
        const edicao = at('Edição', Papel.EDITOR, 8_000, 10);
        expect(edicao.calcularCusto()).toBe(8_000);
        expect(edicao.obterPrazo()).toBe(10);
        expect(edicao.listarSubservicos()).toEqual([]);
        expect(edicao.listarAtomicos()).toEqual([edicao]);
        expect(edicao.validar()).toEqual([]);
    });

    it.each([
        ['1 nível', seq('Pacote', at('A', Papel.EDITOR, 100, 2), at('B', Papel.DIRETOR, 200, 3)), 300, 5],
        ['paralelo', par('Pacote', at('A', Papel.EDITOR, 100, 2), at('B', Papel.DIRETOR, 200, 3)), 300, 3],
        ['3 níveis (pós-produção)', posProducao(), 31_000, 10 + 5 + Math.max(7, 4 + 6, 12)],
        [
            '4 níveis com pacote customizado',
            seq('Projeto', par('Pré', at('Roteiro', Papel.ROTEIRISTA, 10_000, 15)), posProducao()),
            41_000,
            15 + 27
        ]
    ])('calcula custo e prazo recursivamente: %s', (_nome, servico, custo, prazo) => {
        expect(servico.calcularCusto()).toBe(custo);
        expect(servico.obterPrazo()).toBe(prazo);
        expect(servico.validar()).toEqual([]);
    });

    it('a validação percorre a hierarquia toda e diz onde está cada problema', () => {
        const invalido = seq(
            'Projeto',
            seq('Pós', at('Coloração', 'COLORISTA' as Papel, 1_000, 2), at('Mixagem', Papel.SONOPLASTA, -5, 3)),
            seq('Vazio')
        );
        expect(invalido.validar()).toEqual([
            'Projeto > Pós > Coloração: papel técnico inválido "COLORISTA"',
            'Projeto > Pós > Mixagem: custo deve ser zero ou positivo',
            'Projeto > Vazio: o pacote precisa de ao menos um serviço'
        ]);
    });

    it('Projeto delega o custo ao serviço principal e deriva os papéis das folhas (pesos somados)', () => {
        const projeto = projetoCom(posProducao());
        expect(projeto.calcularCustoTotal()).toBe(31_000);
        expect(projeto.getPapeis()).toEqual([Papel.EDITOR, Papel.SONOPLASTA, Papel.EFEITOS_VISUAIS]);
        expect(projeto.pesoDoPapel(Papel.EDITOR)).toBe(3);
        expect(projeto.pesoDoPapel(Papel.EFEITOS_VISUAIS)).toBe(2);
    });

    it('Projeto recusa uma hierarquia inválida já na criação', () => {
        expect(() => projetoCom(seq('Pós', at('Edição', Papel.EDITOR, 1, Number.NaN)))).toThrow(ValidacaoError);
    });

    it('o clone (Prototype) compartilha a árvore imutável sem perder a independência', () => {
        const modelo = PROTOTIPOS.animacao();
        const clone = modelo.clonar({ titulo: 'Outro' });
        expect(clone.getServicoPrincipal()).toBe(modelo.getServicoPrincipal());
        expect(clone.calcularCustoTotal()).toBe(modelo.calcularCustoTotal());
        expect(clone.getPapeisObrigatorios()).not.toBe(modelo.getPapeisObrigatorios());
    });

    it('JSON <-> hierarquia: ida e volta sem perda e com limites para entrada externa', () => {
        const original = posProducao();
        const volta = servicoDeJson(JSON.parse(JSON.stringify(servicoParaJson(original))));
        expect(servicoParaJson(volta)).toEqual(servicoParaJson(original));
        expect(volta.calcularCusto()).toBe(original.calcularCusto());

        let profundo: unknown = { nome: 'folha', papel: 'EDITOR', custo: 1, prazo: 1 };
        for (let i = 0; i < 11; i++) profundo = { nome: `n${i}`, subservicos: [profundo] };
        expect(() => servicoDeJson(profundo)).toThrow(/níveis/);
        expect(() => servicoDeJson({ nome: 'x', subservicos: 'nao-lista' })).toThrow(ValidacaoError);
        expect(() => servicoDeJson({ nome: 'x', papel: 'EDITOR', custo: '10', prazo: 1 })).toThrow(ValidacaoError);
        expect(() => servicoDeJson([])).toThrow(ValidacaoError);
    });

    it('o orquestrador recusa projetos cujos serviços não cabem até a data de entrega', async () => {
        const { sistema } = montarSistema({ profissionais: [criarProfissional({ especialidades: [Papel.EDITOR] })] });
        // HOJE = 10/01/2027; entrega em 20/01/2027 (10 dias), mas a pós-produção leva 27 dias.
        const apertado = projetoCom(posProducao(), { prazo: new Date('2027-01-20T12:00:00Z') });
        await expect(sistema.executarRecomendacao(apertado)).rejects.toThrow(RestricaoInvalidaError);
        await expect(sistema.executarRecomendacao(apertado)).rejects.toThrow(/precisam de 27 dias, mas faltam 10/);

        const folgado = projetoCom(posProducao());
        await expect(sistema.executarRecomendacao(folgado)).resolves.toBeTruthy();
    });

    it('o relatório lista a hierarquia e avisa quando o custo estimado passa do orçamento', () => {
        const relatorio = projetoCom(posProducao(), { orcamento: 20_000 }).aceitar(new GeradorRelatorio());
        expect(relatorio).toContain('SERVIÇOS (custo estimado');
        expect(relatorio).toContain('  - Edição:');
        expect(relatorio).toContain('      - Mixagem:');
        expect(relatorio).toMatch(/custo estimado dos serviços .* passa do orçamento/);
    });
});

describe('Composite na API', () => {
    let app: FastifyInstance | null = null;
    afterEach(async () => {
        await app?.close();
        app = null;
    });

    function corpo(extra: Record<string, unknown>) {
        return {
            titulo: 'Curta com pacote',
            produtor: { id: 'prod-9', nome: 'Bia', email: 'bia@produtora.com' },
            orcamento: 300_000,
            prazo: '2027-06-30',
            localizacao: { cidade: 'Recife', uf: 'PE' },
            ...extra
        };
    }

    function iniciar() {
        const container = criarContainer({ profissionais: gerarProfissionais(300, { semente: 3, referencia: HOJE }), relogio: () => HOJE });
        app = buildApp(container);
        return app;
    }

    it('aceita a hierarquia de serviços e devolve custo, prazo e papéis derivados', async () => {
        const servidor = iniciar();
        const servicoPrincipal = servicoParaJson(seq('Projeto', at('Direção', Papel.DIRETOR, 50_000, 30, 3), posProducao()));
        const resposta = await servidor.inject({ method: 'POST', url: '/projetos/recomendacoes', payload: corpo({ servicoPrincipal }) });

        expect(resposta.statusCode).toBe(201);
        const { projeto } = resposta.json();
        expect(projeto.custoEstimado).toBe(81_000);
        expect(projeto.prazoServicosDias).toBe(57);
        expect(projeto.servicoPrincipal.subservicos).toHaveLength(2);
        expect(projeto.papeisObrigatorios.map((r: { papel: string }) => r.papel)).toEqual([
            'DIRETOR',
            'EDITOR',
            'SONOPLASTA',
            'EFEITOS_VISUAIS'
        ]);
    });

    it('recusa com 400 uma hierarquia inválida ou o envio dos dois formatos juntos', async () => {
        const servidor = iniciar();
        const invalido = await servidor.inject({
            method: 'POST',
            url: '/projetos/recomendacoes',
            payload: corpo({ servicoPrincipal: { nome: 'P', subservicos: [{ nome: 'X', papel: 'EDITOR', custo: -1, prazo: 1 }] } })
        });
        expect(invalido.statusCode).toBe(400);
        expect(invalido.json().mensagem).toContain('P > X: custo deve ser zero ou positivo');

        const ambos = await servidor.inject({
            method: 'POST',
            url: '/projetos/recomendacoes',
            payload: corpo({
                servicoPrincipal: { nome: 'X', papel: 'EDITOR', custo: 1, prazo: 1 },
                papeisObrigatorios: [{ papel: 'EDITOR', peso: 1 }]
            })
        });
        expect(ambos.statusCode).toBe(400);
    });

    it('os modelos trazem a hierarquia pronta, e a lista antiga de papéis continua aceita', async () => {
        const servidor = iniciar();
        const modelos = (await servidor.inject({ method: 'GET', url: '/modelos?tipoProjeto=ANIMACAO' })).json();
        expect(modelos[0].custoEstimado).toBeGreaterThan(0);
        expect(modelos[0].servicoPrincipal.subservicos.length).toBeGreaterThan(1);

        const antigo = await servidor.inject({
            method: 'POST',
            url: '/projetos/recomendacoes',
            payload: corpo({ papeisObrigatorios: [{ papel: 'DIRETOR', peso: 2 }] })
        });
        expect(antigo.statusCode).toBe(201);
        expect(antigo.json().projeto.custoEstimado).toBe(0);
    });
});
