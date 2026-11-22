import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecomendacaoStrategy } from '../../src/application/strategies/RecomendacaoStrategy.js';
import { SimilaridadeCosseno } from '../../src/application/strategies/SimilaridadeCosseno.js';
import { AuditoriaDecorator } from '../../src/application/strategies/decoradores/AuditoriaDecorator.js';
import { CacheDecorator } from '../../src/application/strategies/decoradores/CacheDecorator.js';
import { CompressaoDecorator, type PacoteRecomendacao } from '../../src/application/strategies/decoradores/CompressaoDecorator.js';
import {
    decorar,
    PoliticaDecoradores,
    validarPilha,
    type Camada,
    type CriadoresCamada
} from '../../src/application/strategies/decoradores/PoliticaDecoradores.js';
import { criarContainer } from '../../src/config/container.js';
import { carregarParametros } from '../../src/config/parametros.js';
import type { Profissional } from '../../src/domain/entities/Profissional.js';
import type { Projeto } from '../../src/domain/entities/Projeto.js';
import { RecomendacoesPorPapel } from '../../src/domain/entities/Recomendacao.js';
import { Papel } from '../../src/domain/enums/Papel.js';
import { ValidacaoError } from '../../src/domain/erros.js';
import { gerarProfissionais } from '../../src/infrastructure/dados/geradorProfissionais.js';
import { buildApp } from '../../src/infrastructure/http/app.js';
import { LoggerMemoria } from '../../src/infrastructure/logging/LoggerMemoria.js';
import { criarProjeto, HOJE } from '../fixtures/fabricas.js';
import { montarSistema } from '../fixtures/sistema.js';

const PROFISSIONAIS = gerarProfissionais(400, { semente: 11, referencia: HOJE });
const PAPEIS: Array<[Papel, number]> = [
    [Papel.DIRETOR, 3],
    [Papel.DIRETOR_FOTOGRAFIA, 2],
    [Papel.EDITOR, 1],
    [Papel.SONOPLASTA, 1]
];

// Relógio falso: o "cálculo caro" avança o tempo de forma exata, sem depender da velocidade da máquina (CI).
let tempoFalso = 0;
const relogioFalso = (): number => tempoFalso;

/** Recomendador base de verdade (cosseno), "lento" no relógio falso e com contador de chamadas. */
class RecomendadorLento implements RecomendacaoStrategy {
    readonly nome = 'similaridade-cosseno';
    readonly descricao = 'cosseno lento';
    chamadas = 0;
    private readonly base = new SimilaridadeCosseno();

    constructor(private readonly atrasoMs = 30) {}

    recomendar(projeto: Projeto, profissionais: readonly Profissional[]) {
        this.chamadas++;
        tempoFalso += this.atrasoMs;
        return this.base.recomendar(projeto, profissionais);
    }
}

function cronometrar<T>(fn: () => T): { valor: T; ms: number } {
    const inicio = relogioFalso();
    const valor = fn();
    return { valor, ms: relogioFalso() - inicio };
}

function semDecorador(projeto: Projeto) {
    return new SimilaridadeCosseno().recomendar(projeto, PROFISSIONAIS);
}

describe('Decorator: cache', () => {
    it('reduz o tempo de resposta de requisições repetidas sem chamar o recomendador base de novo', () => {
        const base = new RecomendadorLento(30);
        const cache = new CacheDecorator(base);
        const projeto = criarProjeto({ papeis: PAPEIS });

        const primeira = cronometrar(() => cache.recomendar(projeto, PROFISSIONAIS));
        const segunda = cronometrar(() => cache.recomendar(projeto, PROFISSIONAIS));

        expect(base.chamadas).toBe(1);
        expect(primeira.ms).toBe(30);
        expect(segunda.ms).toBe(0);
        expect(cache.estatisticas()).toEqual({ acertos: 1, falhas: 1, entradas: 1 });
        expect(segunda.valor).toEqual(primeira.valor);
    });

    it('projetos similares (mesmas características, outro id/título) aproveitam o cache', () => {
        const base = new RecomendadorLento(0);
        const cache = new CacheDecorator(base);
        cache.recomendar(criarProjeto({ papeis: PAPEIS, titulo: 'A' }), PROFISSIONAIS);
        cache.recomendar(criarProjeto({ papeis: PAPEIS, titulo: 'B' }), PROFISSIONAIS);
        expect(base.chamadas).toBe(1);
    });

    it('outros candidatos (ex.: um rejeitado a menos), outro orçamento ou cache vencido = nova consulta', () => {
        let agora = 0;
        const base = new RecomendadorLento(0);
        const cache = new CacheDecorator(base, { ttlMs: 1_000, capacidade: 2 }, () => agora);
        const projeto = criarProjeto({ papeis: PAPEIS });

        cache.recomendar(projeto, PROFISSIONAIS);
        cache.recomendar(projeto, PROFISSIONAIS.slice(1));
        cache.recomendar(criarProjeto({ papeis: PAPEIS, orcamento: 99_000 }), PROFISSIONAIS);
        expect(base.chamadas).toBe(3);

        agora = 5_000;
        cache.recomendar(criarProjeto({ papeis: PAPEIS, orcamento: 99_000 }), PROFISSIONAIS);
        expect(base.chamadas).toBe(4);
        expect(cache.estatisticas().entradas).toBe(2);
    });

    it('quem recebe o resultado pode alterá-lo sem estragar o que está guardado', () => {
        const cache = new CacheDecorator(new RecomendadorLento(0));
        const projeto = criarProjeto({ papeis: PAPEIS });
        cache.recomendar(projeto, PROFISSIONAIS).clear();
        expect(cache.recomendar(projeto, PROFISSIONAIS).size).toBe(PAPEIS.length);
    });
});

describe('Decorator: auditoria', () => {
    it('registra cada chamada com tempo de resposta, inclusive as que falham (e repassa o erro)', () => {
        const logger = new LoggerMemoria();
        const falha: RecomendacaoStrategy = {
            nome: 'quebrado',
            descricao: '',
            recomendar: () => {
                throw new Error('fonte fora do ar');
            }
        };
        const auditada = new AuditoriaDecorator(new RecomendadorLento(5), logger, { cronometro: relogioFalso });
        const projeto = criarProjeto({ papeis: PAPEIS });
        auditada.recomendar(projeto, PROFISSIONAIS);
        auditada.recomendar(projeto, PROFISSIONAIS);

        expect(auditada.getRegistros()).toHaveLength(2);
        expect(auditada.getRegistros()[0]).toMatchObject({
            estrategia: 'similaridade-cosseno',
            projetoId: projeto.getId(),
            candidatos: PROFISSIONAIS.length,
            sucesso: true
        });
        expect(auditada.getRegistros()[0]!.duracaoMs).toBe(5);

        const quebrada = new AuditoriaDecorator(falha, logger, { capacidade: 1 });
        expect(() => quebrada.recomendar(projeto, [])).toThrow('fonte fora do ar');
        expect(() => quebrada.recomendar(projeto, [])).toThrow();
        expect(quebrada.getRegistros()).toEqual([expect.objectContaining({ sucesso: false, erro: 'fonte fora do ar' })]);
        expect(logger.getEntradas().filter((e) => e.mensagem === 'Chamada ao recomendador')).toHaveLength(2);
    });
});

describe('Decorator: compressão', () => {
    it('reduz o tamanho dos dados transmitidos, e o receptor recupera exatamente o resultado', () => {
        const destino: PacoteRecomendacao[] = [];
        const comprimida = new CompressaoDecorator(new SimilaridadeCosseno(), (pacote) => destino.push(pacote));
        const projeto = criarProjeto({ papeis: PAPEIS });
        const resultado = comprimida.recomendar(projeto, PROFISSIONAIS);

        const pacote = comprimida.ultimoPacote()!;
        expect(destino).toEqual([pacote]);
        expect(pacote.comprimido).toBe(true);
        expect(pacote.tamanhoTransmitido).toBeLessThan(pacote.tamanhoOriginal * 0.6);
        expect(comprimida.estatisticas()).toEqual({
            bytesOriginais: pacote.tamanhoOriginal,
            bytesTransmitidos: pacote.tamanhoTransmitido
        });

        const recebido = CompressaoDecorator.descomprimir(pacote);
        expect(recebido[Papel.DIRETOR]?.map((c) => c.id)).toEqual(resultado.get(Papel.DIRETOR)?.map((p) => p.getId()));
        expect(resultado).toEqual(semDecorador(projeto));
    });

    it('não comprime quando o gzip aumentaria o tamanho (resultado muito pequeno)', () => {
        const pacote = CompressaoDecorator.comprimir(new Map([[Papel.EDITOR, []]]));
        expect(pacote.comprimido).toBe(false);
        expect(CompressaoDecorator.descomprimir(pacote)).toEqual({ EDITOR: [] });
    });
});

describe('Decorator: combinação em ordens diferentes, sem alterar o recomendador base', () => {
    function criadores(logger: LoggerMemoria): CriadoresCamada {
        return {
            cache: (i) => new CacheDecorator(i),
            auditoria: (i) => new AuditoriaDecorator(i, logger),
            compressao: (i) => new CompressaoDecorator(i)
        };
    }

    it.each<[string, Camada[], number]>([
        // A ordem é a de aplicação: a primeira camada fica mais perto do recomendador base.
        ['cache -> auditoria -> compressão (a auditoria vê os acertos de cache)', ['cache', 'auditoria', 'compressao'], 3],
        ['auditoria -> cache (a auditoria só vê o que chega ao recomendador)', ['auditoria', 'cache'], 1],
        ['compressão -> auditoria', ['compressao', 'auditoria'], 3]
    ])('%s', (_nome, camadas, chamadasAuditadas) => {
        const logger = new LoggerMemoria();
        const base = new RecomendadorLento(0);
        const decorado = decorar(base, camadas, criadores(logger));
        const projeto = criarProjeto({ papeis: PAPEIS });

        const resultados = [1, 2, 3].map(() => decorado.recomendar(projeto, PROFISSIONAIS));

        expect(decorado.nome).toBe('similaridade-cosseno');
        expect(decorado.descricao).toBe('cosseno lento');
        expect(logger.getEntradas().filter((e) => e.mensagem === 'Chamada ao recomendador')).toHaveLength(chamadasAuditadas);
        for (const resultado of resultados) {
            const esperado = semDecorador(projeto);
            expect(resultado).toEqual(esperado);
            expect(RecomendacoesPorPapel.de(resultado).paraRanking()).toEqual(esperado.paraRanking());
        }
    });
});

describe('Decorator: pilha definida em tempo de execução', () => {
    const criadoresSimples: CriadoresCamada = {
        cache: (i) => new CacheDecorator(i),
        auditoria: (i) => new AuditoriaDecorator(i, new LoggerMemoria()),
        compressao: (i) => new CompressaoDecorator(i)
    };

    it('usa a preferência do produtor ou a pilha padrão, e reaproveita o recomendador decorado', () => {
        const politica = new PoliticaDecoradores({ padrao: ['cache'], porProdutor: { 'produtor-1': ['auditoria'] } }, criadoresSimples);
        const base = new RecomendadorLento(0);
        const doProdutor1 = criarProjeto();
        expect(politica.pilhaPara(doProdutor1)).toEqual(['auditoria']);
        expect(politica.aplicar(base, doProdutor1)).toBeInstanceOf(AuditoriaDecorator);
        expect(politica.aplicar(base, doProdutor1)).toBe(politica.aplicar(base, doProdutor1));

        // Outra instância com o mesmo nome (ex.: outra configuração) ganha a própria pilha, não a da anterior.
        const outra = new RecomendadorLento(0);
        expect(politica.aplicar(outra, doProdutor1)).not.toBe(politica.aplicar(base, doProdutor1));

        politica.definirPreferencia('produtor-1', []);
        expect(politica.aplicar(base, doProdutor1)).toBe(base);
    });

    it('recusa camada desconhecida ou repetida', () => {
        expect(() => validarPilha(['cache', 'gzip'])).toThrow(ValidacaoError);
        expect(() => validarPilha(['cache', 'cache'])).toThrow(/duas vezes/);
        expect(() => new PoliticaDecoradores({ padrao: ['x' as Camada], porProdutor: {} }, criadoresSimples)).toThrow();
    });

    it('a variável DECORADORES define a pilha padrão (vazia = nenhum)', () => {
        expect(carregarParametros({ DECORADORES: 'auditoria, cache' }).decoradores.padrao).toEqual(['auditoria', 'cache']);
        expect(carregarParametros({ DECORADORES: '' }).decoradores.padrao).toEqual([]);
        expect(carregarParametros({}).decoradores.padrao).toEqual(['cache', 'auditoria', 'compressao']);
    });

    it('o SistemaRecomendacao usa a pilha que receber, sem saber quais camadas existem', async () => {
        const logger = new LoggerMemoria();
        let pilha: Camada[] = ['cache', 'auditoria'];
        const montados = new Map<string, RecomendacaoStrategy>();
        const { sistema } = montarSistema({
            profissionais: PROFISSIONAIS,
            decorarEstrategia: (estrategia) => {
                const chave = pilha.join('>');
                if (!montados.has(chave)) {
                    montados.set(chave, decorar(estrategia, pilha, { ...criadoresSimples, auditoria: (i) => new AuditoriaDecorator(i, logger) }));
                }
                return montados.get(chave)!;
            }
        });
        const projeto = criarProjeto({ papeis: PAPEIS });

        await sistema.executarRecomendacao(projeto);
        await sistema.executarRecomendacao(projeto);
        pilha = ['auditoria', 'cache'];
        await sistema.executarRecomendacao(projeto);
        await sistema.executarRecomendacao(projeto);

        // 2 chamadas auditadas na 1ª pilha (cache por dentro) + 1 na 2ª (cache por fora absorve a repetição).
        expect(logger.getEntradas().filter((e) => e.mensagem === 'Chamada ao recomendador')).toHaveLength(3);
    });
});

describe('Decorator na API', () => {
    let app: FastifyInstance | null = null;
    afterEach(async () => {
        await app?.close();
        app = null;
    });

    it('o produtor escolhe a pilha pela API, e uma pilha inválida devolve 400', async () => {
        const container = criarContainer({ profissionais: PROFISSIONAIS, relogio: () => HOJE });
        app = buildApp(container);

        const estrategias = (await app.inject({ method: 'GET', url: '/estrategias' })).json();
        expect(estrategias.decoradores).toEqual(['cache', 'auditoria', 'compressao']);
        expect(estrategias.integracoes).toEqual({ armazenamento: 's3', pagamento: 'stripe', profissional: 'interno' });

        const ok = await app.inject({ method: 'PUT', url: '/produtores/prod-7/decoradores', payload: { decoradores: ['auditoria'] } });
        expect(ok.json()).toEqual({ produtorId: 'prod-7', decoradores: ['auditoria'] });
        const ruim = await app.inject({ method: 'PUT', url: '/produtores/prod-7/decoradores', payload: { decoradores: ['zip'] } });
        expect(ruim.statusCode).toBe(400);

        const corpo = {
            titulo: 'Com auditoria',
            produtor: { id: 'prod-7', nome: 'Rui', email: 'rui@produtora.com' },
            orcamento: 300_000,
            prazo: '2027-06-30',
            localizacao: { cidade: 'Recife', uf: 'PE' }
        };
        const criado = await app.inject({ method: 'POST', url: '/projetos/recomendacoes', payload: corpo });
        expect(criado.statusCode).toBe(201);
        expect(criado.json().recomendacao.estrategia).toBe('similaridade-cosseno');
        expect(container.logger instanceof LoggerMemoria).toBe(true);
        const auditadas = (container.logger as LoggerMemoria).getEntradas().filter((e) => e.mensagem === 'Chamada ao recomendador');
        expect(auditadas).toHaveLength(1);
    });
});
