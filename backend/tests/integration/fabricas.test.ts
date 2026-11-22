import { describe, expect, it } from 'vitest';
import { FabricaAnimacao } from '../../src/application/fabricas/animacao/FabricaAnimacao.js';
import { FabricaDocumentario } from '../../src/application/fabricas/documentario/FabricaDocumentario.js';
import { FabricaProjeto, type DadosProjeto } from '../../src/application/fabricas/FabricaProjeto.js';
import { FabricaGeral } from '../../src/application/fabricas/geral/FabricaGeral.js';
import { NotificadorGeral } from '../../src/application/fabricas/geral/NotificadorGeral.js';
import { ValidadorGeral } from '../../src/application/fabricas/geral/ValidadorGeral.js';
import { FabricaPublicitario } from '../../src/application/fabricas/publicitario/FabricaPublicitario.js';
import { OrquestradorPadrao } from '../../src/application/orquestrador/OrquestradorPadrao.js';
import { criarRegistroPrototipos } from '../../src/application/prototipos/catalogoPrototipos.js';
import type { RecomendacaoStrategy } from '../../src/application/strategies/RecomendacaoStrategy.js';
import { SimilaridadeCosseno } from '../../src/application/strategies/SimilaridadeCosseno.js';
import { GeradorRelatorio } from '../../src/application/visitors/GeradorRelatorio.js';
import { Projeto, type ProjetoProps } from '../../src/domain/entities/Projeto.js';
import { ProjetoAnimacao } from '../../src/domain/entities/projetos/ProjetoAnimacao.js';
import { ProjetoDocumentario } from '../../src/domain/entities/projetos/ProjetoDocumentario.js';
import { ProjetoPublicitario } from '../../src/domain/entities/projetos/ProjetoPublicitario.js';
import { Papel } from '../../src/domain/enums/Papel.js';
import { TipoCaptacao } from '../../src/domain/enums/TipoCaptacao.js';
import { TipoProjeto } from '../../src/domain/enums/TipoProjeto.js';
import { RestricaoInvalidaError, ValidacaoError } from '../../src/domain/erros.js';
import { Localizacao } from '../../src/domain/value-objects/Localizacao.js';
import { RequisitoPapel } from '../../src/domain/value-objects/RequisitoPapel.js';
import { criarProfissional, HOJE, PRAZO_PADRAO } from '../fixtures/fabricas.js';
import { criarCanais, montarSistema } from '../fixtures/sistema.js';
import { pacoteDePapeis } from '../../src/domain/servicos/serializacao.js';

// Profissionais com perfis bem diferentes: cada tipo de projeto deve preferir (ou aceitar) uns e não outros.
const diretorDocumental = criarProfissional({
    id: 'dir-doc',
    especialidades: [Papel.DIRETOR],
    competencias: { direcao: 8, pesquisa: 9, documentario: 9 }
});
const diretorAnimacao = criarProfissional({
    id: 'dir-anim',
    especialidades: [Papel.DIRETOR],
    competencias: { direcao: 8, animacao3d: 9, animacao: 9 }
});
const diretorPublicidade = criarProfissional({
    id: 'dir-pub',
    especialidades: [Papel.DIRETOR],
    competencias: { direcao: 8, fotografia: 9, colorizacao: 8, ficcao: 8 }
});
const roteirista = criarProfissional({
    id: 'roteirista',
    especialidades: [Papel.ROTEIRISTA],
    competencias: { roteiro: 8, pesquisa: 9, documentario: 7 }
});
const artistaVfx = criarProfissional({
    id: 'vfx',
    especialidades: [Papel.EFEITOS_VISUAIS],
    competencias: { efeitos: 7, animacao3d: 9, animacao: 8 }
});
const editor = criarProfissional({
    id: 'editor',
    especialidades: [Papel.EDITOR],
    competencias: { montagem: 9, colorizacao: 9, ficcao: 6 }
});
const TODOS = [diretorDocumental, diretorAnimacao, diretorPublicidade, roteirista, artistaVfx, editor];

function dados(extra: Partial<DadosProjeto> = {}): DadosProjeto {
    return {
        titulo: 'Projeto de teste',
        produtor: { id: 'produtor-1', nome: 'Ana Produtora', email: 'ana@produtora.test' },
        orcamento: 300_000,
        prazo: PRAZO_PADRAO,
        localizacao: { cidade: 'Recife', uf: 'PE' },
        ...extra
    };
}

const CENARIOS = [
    {
        nome: 'documentário',
        fabrica: () => new FabricaDocumentario(criarCanais()),
        dados: dados({
            papeisObrigatorios: [
                { papel: Papel.DIRETOR, peso: 3 },
                { papel: Papel.ROTEIRISTA, peso: 2 }
            ],
            especificos: { tema: 'Seca no Nordeste', entrevistados: [] }
        }),
        classe: ProjetoDocumentario,
        recomendador: 'recomendador-documentario',
        diretorEsperado: diretorDocumental,
        prefixoMensagem: '[Documentário]'
    },
    {
        nome: 'animação',
        fabrica: () => new FabricaAnimacao(criarCanais()),
        dados: dados({
            papeisObrigatorios: [
                { papel: Papel.DIRETOR, peso: 3 },
                { papel: Papel.EFEITOS_VISUAIS, peso: 3 }
            ],
            especificos: { tecnica: '3D', softwares: ['Blender'] }
        }),
        classe: ProjetoAnimacao,
        recomendador: 'recomendador-animacao',
        diretorEsperado: diretorAnimacao,
        prefixoMensagem: '[Animação]'
    },
    {
        nome: 'publicitário',
        fabrica: () => new FabricaPublicitario(criarCanais()),
        dados: dados({
            duracao: 1,
            papeisObrigatorios: [
                { papel: Papel.DIRETOR, peso: 3 },
                { papel: Papel.EDITOR, peso: 2 }
            ],
            especificos: { cliente: 'Café Bom', veiculacao: ['TV', 'internet'] }
        }),
        classe: ProjetoPublicitario,
        recomendador: 'recomendador-publicitario',
        diretorEsperado: diretorPublicidade,
        prefixoMensagem: '[Publicidade]'
    }
] as const;

describe('Abstract Factory: cada fábrica cria uma família coerente', () => {
    it.each(CENARIOS)('$nome: projeto, validador, recomendador e notificador do mesmo tipo', (cenario) => {
        const fabrica = cenario.fabrica();
        const projeto = fabrica.criarProjeto(cenario.dados);

        expect(projeto).toBeInstanceOf(cenario.classe);
        expect(projeto.getTipo()).toBe(fabrica.tipo);
        expect(projeto.getTitulo()).toBe('Projeto de teste');
        expect(fabrica.criarRecomendador().nome).toBe(cenario.recomendador);
        expect(projeto.aceitar(fabrica.criarValidador())).toBe(true);
        expect(fabrica.criarNotificador().nome).toMatch(/^Notificador/);
    });

    it('cada projeto criado é um clone novo do protótipo (ids diferentes, protótipo intacto)', () => {
        const prototipos = criarRegistroPrototipos();
        const fabrica = new FabricaDocumentario(criarCanais(), prototipos);

        const a = fabrica.criarProjeto(dados({ especificos: { tema: 'A' } }));
        const b = fabrica.criarProjeto(dados({ especificos: { tema: 'B' } }));

        const modelo = prototipos.clonar('documentario') as ProjetoDocumentario;
        expect(a.getId()).not.toBe(b.getId());
        expect(modelo.getTema()).toBe('A definir');
        // sem papéis informados, herda os papéis do modelo
        expect(a.getPapeis()).toEqual(modelo.getPapeis());
    });

    it('usa a variação de modelo pedida, desde que seja do mesmo tipo', () => {
        const fabrica = new FabricaAnimacao(criarCanais());

        const stopMotion = fabrica.criarProjeto(dados({ modelo: 'animacao-stop-motion' }));

        expect(stopMotion.getTecnica()).toBe('STOP_MOTION');
        expect(stopMotion.getSoftwares()).toEqual(['Dragonframe']);
        expect(stopMotion.getDuracao()).toBe(12);
        expect(() => fabrica.criarProjeto(dados({ modelo: 'documentario-curta' }))).toThrow(/não é um projeto do tipo ANIMACAO/);
        expect(() => fabrica.criarProjeto(dados({ modelo: 'nao-existe' }))).toThrow(ValidacaoError);
        expect(() => new FabricaGeral(criarCanais(), new SimilaridadeCosseno()).criarProjeto(dados({ modelo: 'animacao' }))).toThrow(
            /não é um projeto do tipo GERAL/
        );
    });
});

describe('OrquestradorEquipe com fábricas diferentes (o mesmo código, sem if por tipo)', () => {
    it.each(CENARIOS)('$nome: usa o recomendador e o filtro de aptidão da fábrica', (cenario) => {
        const fabrica = cenario.fabrica();
        const orquestrador = new OrquestradorPadrao(fabrica, TODOS, { relogio: () => HOJE, quantidadeSugestoes: 1 });
        const projeto = fabrica.criarProjeto(cenario.dados);

        const equipe = orquestrador.orquestrar(projeto);

        expect(orquestrador.getResultado().estrategia.nome).toBe(cenario.recomendador);
        expect(equipe.obterMembro(Papel.DIRETOR)?.getProfissional()).toBe(cenario.diretorEsperado);
    });

    it('documentário descarta quem não tem experiência documental', () => {
        const fabrica = new FabricaDocumentario(criarCanais());
        const projeto = fabrica.criarProjeto(CENARIOS[0].dados);

        const orquestrador = new OrquestradorPadrao(fabrica, TODOS, { relogio: () => HOJE });
        orquestrador.orquestrar(projeto);
        const diretores = orquestrador.getResultado().ranking.get(Papel.DIRETOR)?.map((c) => c.profissional.getId());

        expect(diretores).toEqual(['dir-doc']);
    });

    it('uma estratégia escolhida explicitamente tem prioridade sobre a da fábrica', () => {
        const fabrica = new FabricaAnimacao(criarCanais());
        const projeto = fabrica.criarProjeto(CENARIOS[1].dados);
        const escolhida: RecomendacaoStrategy = new SimilaridadeCosseno();

        const orquestrador = new OrquestradorPadrao(fabrica, TODOS, { relogio: () => HOJE });
        orquestrador.orquestrar(projeto, escolhida);

        expect(orquestrador.getResultado().estrategia).toBe(escolhida);
    });

    it.each([
        [
            'documentário sem roteirista',
            () => new FabricaDocumentario(criarCanais()),
            dados({ papeisObrigatorios: [{ papel: Papel.DIRETOR, peso: 1 }], especificos: { tema: 'Rios' } }),
            /documentário precisa do papel Roteiro/
        ],
        [
            'documentário com entrevistas e sem sonoplasta',
            () => new FabricaDocumentario(criarCanais()),
            dados({
                papeisObrigatorios: [{ papel: Papel.ROTEIRISTA, peso: 1 }],
                especificos: { tema: 'Rios', entrevistados: ['Ana'] }
            }),
            /Sonoplastia/
        ],
        [
            'animação 3D sem software',
            () => new FabricaAnimacao(criarCanais()),
            dados({ especificos: { tecnica: '3D', softwares: [] } }),
            /software de modelagem/
        ],
        [
            'publicidade longa demais',
            () => new FabricaPublicitario(criarCanais()),
            dados({ duracao: 30, especificos: { cliente: 'Café Bom' } }),
            /no máximo 5 minutos/
        ]
    ] as const)('valida as regras do tipo: %s', (_nome, criarFabrica, entrada, erro) => {
        const fabrica = criarFabrica();
        const projeto = fabrica.criarProjeto(entrada);
        const orquestrador = new OrquestradorPadrao(fabrica, TODOS, { relogio: () => HOJE });

        expect(() => orquestrador.orquestrar(projeto)).toThrow(RestricaoInvalidaError);
        expect(() => orquestrador.orquestrar(projeto)).toThrow(erro);
    });

    it('recusa misturar famílias: projeto de animação com a fábrica de documentário', () => {
        const animacao = new FabricaAnimacao(criarCanais()).criarProjeto(CENARIOS[1].dados);
        const orquestrador = new OrquestradorPadrao(new FabricaDocumentario(criarCanais()), TODOS, { relogio: () => HOJE });

        expect(() => orquestrador.orquestrar(animacao)).toThrow(/não é do tipo documentário/);
    });
});

describe('SistemaRecomendacao escolhe a fábrica pelo tipo do projeto', () => {
    it.each(CENARIOS)('$nome: recomendação e notificação no formato do tipo', async (cenario) => {
        const { sistema, fabricas, canais } = montarSistema({ profissionais: TODOS });
        const projeto = fabricas.obter(cenario.fabrica().tipo).criarProjeto(cenario.dados);

        const resultado = await sistema.executarRecomendacao(projeto);

        expect(resultado.recomendacao.getEstrategia()).toBe(cenario.recomendador);
        expect(resultado.sugestoes[0]?.obterMembro(Papel.DIRETOR)?.getProfissional()).toBe(cenario.diretorEsperado);
        const mensagens = await canais.mensagens.listar('produtor-1');
        expect(mensagens).toHaveLength(1);
        expect(mensagens[0]?.titulo.startsWith(cenario.prefixoMensagem)).toBe(true);
    });

    it('o projeto geral (ATV1) continua usando a estratégia padrão e o notificador geral', async () => {
        const { sistema, fabricas, canais } = montarSistema({ profissionais: TODOS });
        const projeto = fabricas.obter(TipoProjeto.GERAL).criarProjeto(
            dados({ papeisObrigatorios: [{ papel: Papel.DIRETOR, peso: 1 }] })
        );

        const resultado = await sistema.executarRecomendacao(projeto);

        expect(resultado.recomendacao.getEstrategia()).toBe('similaridade-cosseno');
        expect((await canais.mensagens.listar('produtor-1'))[0]?.titulo).toMatch(/^Recomendação pronta/);
    });

    it('uma falha no notificador do tipo é registrada e não derruba a recomendação', async () => {
        const { sistema, fabricas, canais, logger } = montarSistema({ profissionais: TODOS });
        canais.mensagens.entregar = async () => {
            throw new Error('caixa fora do ar');
        };
        const projeto = fabricas.obter(TipoProjeto.DOCUMENTARIO).criarProjeto(CENARIOS[0].dados);

        await expect(sistema.executarRecomendacao(projeto)).resolves.toBeDefined();
        expect(logger.getEntradas()).toContainEqual({
            nivel: 'error',
            mensagem: 'Falha no notificador do tipo de projeto',
            contexto: { notificador: 'NotificadorDocumentario', erro: 'caixa fora do ar' }
        });
    });

    it('um tipo novo (realidade virtual) entra só com uma subclasse e uma fábrica, sem mudar o orquestrador', async () => {
        const REALIDADE_VIRTUAL = 'REALIDADE_VIRTUAL' as unknown as TipoProjeto;

        class ProjetoRealidadeVirtual extends Projeto {
            public override getTipo(): TipoProjeto {
                return REALIDADE_VIRTUAL;
            }

            public override clonar(ajustes: Partial<ProjetoProps> = {}): ProjetoRealidadeVirtual {
                return new ProjetoRealidadeVirtual(this.propsClonadas(ajustes));
            }
        }

        const canais = criarCanais();
        const prototipos = criarRegistroPrototipos();
        prototipos.registrar(
            'realidade-virtual',
            new ProjetoRealidadeVirtual({
                titulo: 'Modelo VR',
                produtor: { id: 'cinebridge', nome: 'CineBridge', email: 'modelos@cinebridge.local' },
                genero: 'experiencia imersiva',
                duracao: 20,
                orcamento: 1,
                prazo: PRAZO_PADRAO,
                tipoCaptacao: TipoCaptacao.FICCAO,
                localizacao: new Localizacao('São Paulo', 'SP'),
                servicoPrincipal: pacoteDePapeis([new RequisitoPapel(Papel.DIRETOR, 1)])
            }),
            'Experiência imersiva de 20 minutos'
        );

        class FabricaRealidadeVirtual extends FabricaProjeto {
            readonly tipo = REALIDADE_VIRTUAL;
            protected readonly modeloPadrao = 'realidade-virtual';

            public criarProjeto(entrada: DadosProjeto): ProjetoRealidadeVirtual {
                return this.clonarModelo(entrada, ProjetoRealidadeVirtual, {});
            }

            public criarGeradorRelatorio(): GeradorRelatorio {
                return new GeradorRelatorio(new ValidadorGeral());
            }

            public criarValidador(): ValidadorGeral {
                return new ValidadorGeral();
            }

            public criarRecomendador(): RecomendacaoStrategy {
                const motor = new SimilaridadeCosseno();
                return { nome: 'recomendador-vr', descricao: 'teste', recomendar: (...args) => motor.recomendar(...args) };
            }

            public criarNotificador(): NotificadorGeral {
                return new NotificadorGeral(canais);
            }
        }

        const { sistema, fabricas } = montarSistema({ profissionais: TODOS });
        expect(() => fabricas.obter(REALIDADE_VIRTUAL)).toThrow(ValidacaoError);
        fabricas.registrar(new FabricaRealidadeVirtual(prototipos));

        const projeto = fabricas.obter(REALIDADE_VIRTUAL).criarProjeto(dados());
        const resultado = await sistema.executarRecomendacao(projeto);

        expect(projeto).toBeInstanceOf(ProjetoRealidadeVirtual);
        expect(resultado.recomendacao.getEstrategia()).toBe('recomendador-vr');
        expect(resultado.sugestoes[0]?.obterMembro(Papel.DIRETOR)).not.toBeNull();
    });
});
