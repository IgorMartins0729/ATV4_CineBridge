import { describe, expect, it } from 'vitest';
import { OrquestradorEquipe } from '../../../src/application/orquestrador/OrquestradorEquipe.js';
import { OrquestradorPadrao } from '../../../src/application/orquestrador/OrquestradorPadrao.js';
import type { RecomendacaoStrategy } from '../../../src/application/strategies/RecomendacaoStrategy.js';
import { SimilaridadeCosseno } from '../../../src/application/strategies/SimilaridadeCosseno.js';
import { Equipe } from '../../../src/domain/entities/Equipe.js';
import type { Profissional } from '../../../src/domain/entities/Profissional.js';
import type { Projeto } from '../../../src/domain/entities/Projeto.js';
import { Papel } from '../../../src/domain/enums/Papel.js';
import { RestricaoInvalidaError } from '../../../src/domain/erros.js';
import { criarProfissional, criarProjeto, HOJE } from '../../fixtures/fabricas.js';
import { criarFabricaGeral } from '../../fixtures/sistema.js';

/** Subclasse de teste que só registra a ordem em que o template chama as etapas. */
class OrquestradorEspiao extends OrquestradorEquipe {
    readonly chamadas: string[] = [];
    problemasParaReportar: string[] = [];

    constructor(candidatos: readonly Profissional[] = []) {
        super(criarFabricaGeral(), candidatos, { quantidadeSugestoes: 1 });
    }

    protected validarRestricoes(): boolean {
        this.chamadas.push('validarRestricoes');
        this.problemasParaReportar.forEach((p) => this.reportarProblema(p));
        return this.problemasParaReportar.length === 0;
    }

    protected normalizarDados(_projeto: Projeto, profissionais: readonly Profissional[]): Profissional[] {
        this.chamadas.push('normalizarDados');
        return [...profissionais];
    }

    protected posProcessar(recomendacoes: Map<Papel, Profissional[]>): Map<Papel, Profissional[]> {
        this.chamadas.push('posProcessar');
        return recomendacoes;
    }
}

function estrategiaEspia(chamadas: string[]): RecomendacaoStrategy {
    return {
        nome: 'espia',
        descricao: 'registra a chamada',
        recomendar: (projeto, profissionais) => {
            chamadas.push('recomendar');
            return new SimilaridadeCosseno().recomendar(projeto, profissionais);
        }
    };
}

describe('Template Method: fluxo principal invariável', () => {
    it('chama as etapas sempre na mesma ordem', () => {
        const projeto = criarProjeto();
        const comCandidato = new OrquestradorEspiao([criarProfissional()]);
        const semCandidato = new OrquestradorEspiao();
        comCandidato.orquestrar(projeto, estrategiaEspia(comCandidato.chamadas));
        semCandidato.orquestrar(projeto, estrategiaEspia(semCandidato.chamadas));

        const esperado = ['validarRestricoes', 'normalizarDados', 'recomendar', 'posProcessar'];
        expect(comCandidato.chamadas).toEqual(esperado);
        expect(semCandidato.chamadas).toEqual(esperado);
    });

    it('orquestrar(projeto, estrategia) devolve a melhor Equipe; os detalhes ficam em getResultado()', () => {
        const diretor = criarProfissional({ id: 'dir' });
        const orquestrador = new OrquestradorEspiao([diretor]);
        expect(() => orquestrador.getResultado()).toThrow(/ainda não foi chamado/);

        const equipe = orquestrador.orquestrar(criarProjeto(), new SimilaridadeCosseno());

        expect(equipe).toBeInstanceOf(Equipe);
        expect(equipe.obterMembro(Papel.DIRETOR)?.getProfissional()).toBe(diretor);
        expect(orquestrador.getResultado().sugestoes[0]).toBe(equipe);
    });

    it('sem candidatos, devolve uma equipe vazia', () => {
        const equipe = new OrquestradorEspiao().orquestrar(criarProjeto(), new SimilaridadeCosseno());
        expect(equipe.getMembros()).toEqual([]);
    });

    it('interrompe o fluxo antes de recomendar quando a validação falha', () => {
        const orquestrador = new OrquestradorEspiao();
        orquestrador.problemasParaReportar = ['orçamento inválido'];
        expect(() => orquestrador.orquestrar(criarProjeto(), estrategiaEspia(orquestrador.chamadas))).toThrow(
            /orçamento inválido/
        );
        expect(orquestrador.chamadas).toEqual(['validarRestricoes']);
    });

    it('validarRestricoes false sem motivo informado ainda interrompe com uma mensagem genérica', () => {
        class OrquestradorMudo extends OrquestradorEspiao {
            protected override validarRestricoes(): boolean {
                return false;
            }
        }
        expect(() => new OrquestradorMudo().orquestrar(criarProjeto())).toThrow(RestricaoInvalidaError);
    });

    it('impede que uma subclasse sobrescreva o método template', () => {
        class OrquestradorRebelde extends OrquestradorPadrao {
            override orquestrar(): never {
                throw new Error('fluxo alterado');
            }
        }
        expect(() => new OrquestradorRebelde(criarFabricaGeral(), [])).toThrow(/não pode sobrescrever orquestrar/);
    });

    it('sem estratégia, usa o recomendador da fábrica', () => {
        const orquestrador = new OrquestradorEspiao([criarProfissional()]);
        orquestrador.orquestrar(criarProjeto());
        expect(orquestrador.getResultado().estrategia.nome).toBe('similaridade-cosseno');
    });

    it('aceita estratégia externa que devolve um Map simples (pontuação pela posição)', () => {
        const a = criarProfissional({ id: 'a' });
        const b = criarProfissional({ id: 'b' });
        const externa: RecomendacaoStrategy = {
            nome: 'externa',
            descricao: 'Map simples, sem pontuação',
            recomendar: () => new Map([[Papel.DIRETOR, [b, a]]])
        };
        const orquestrador = new OrquestradorPadrao(criarFabricaGeral(), [a, b], { relogio: () => HOJE });

        orquestrador.orquestrar(criarProjeto(), externa);

        const ranking = orquestrador.getResultado().ranking.get(Papel.DIRETOR) ?? [];
        expect(ranking.map((c) => [c.profissional.getId(), c.pontuacao])).toEqual([
            ['b', 1],
            ['a', 0.5]
        ]);
    });
});

describe('OrquestradorPadrao', () => {
    const relogio = () => HOJE;
    const estrategia = new SimilaridadeCosseno();
    const orquestradorCom = (candidatos: readonly Profissional[], quantidadeSugestoes?: number) =>
        new OrquestradorPadrao(criarFabricaGeral(), candidatos, {
            relogio,
            ...(quantidadeSugestoes ? { quantidadeSugestoes } : {})
        });

    it('valida prazo e orçamento', () => {
        const orquestrador = orquestradorCom([]);
        const atrasado = criarProjeto({ prazo: new Date('2026-12-01') });
        expect(() => orquestrador.orquestrar(atrasado, estrategia)).toThrow(/data de entrega precisa ser futura/);

        const semVerba = criarProjeto({ orcamento: 1.5, papeis: [[Papel.DIRETOR, 1], [Papel.EDITOR, 1]] });
        expect(() => orquestrador.orquestrar(semVerba, estrategia)).toThrow(/orçamento insuficiente/);
    });

    it('recusa projeto com equipe já formada', () => {
        const projeto = criarProjeto();
        const diretor = criarProfissional({ id: 'd' });
        projeto.aceitarRecomendacao(Papel.DIRETOR, diretor);
        projeto.getEquipe()!.confirmarMembro(Papel.DIRETOR, 'd');
        projeto.getEquipe()!.formar(projeto.getPapeis());
        expect(() => orquestradorCom([]).orquestrar(projeto, estrategia)).toThrow(/já foi formada/);
    });

    it('normaliza: remove duplicados, indisponíveis, sem especialidade e caros demais', () => {
        const ok = criarProfissional({ id: 'ok', preco: 10_000 });
        const indisponivel = criarProfissional({ id: 'fora', disponivelAte: new Date('2027-03-01') });
        const caro = criarProfissional({ id: 'caro', preco: 500_000 });
        const editor = criarProfissional({ id: 'editor', especialidades: [Papel.EDITOR] });
        const orquestrador = orquestradorCom([ok, ok, indisponivel, caro, editor]);

        orquestrador.orquestrar(criarProjeto({ orcamento: 100_000 }), estrategia);

        expect(orquestrador.getResultado().ranking.get(Papel.DIRETOR)?.map((c) => c.profissional.getId())).toEqual(['ok']);
    });

    it('pós-processa descartando candidatos com pontuação zero e informa papéis sem candidatos', () => {
        const semAderencia = criarProfissional({ id: 'zero', competencias: { culinaria: 9 } });
        const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 2], [Papel.SONOPLASTA, 1]] });
        const orquestrador = orquestradorCom([semAderencia]);

        const equipe = orquestrador.orquestrar(projeto, estrategia);

        const resultado = orquestrador.getResultado();
        expect(resultado.ranking.get(Papel.DIRETOR)).toEqual([]);
        expect(resultado.papeisSemCandidatos).toEqual([Papel.DIRETOR, Papel.SONOPLASTA]);
        expect(resultado.sugestoes).toEqual([]);
        expect(equipe.getMembros()).toEqual([]);
    });

    it('monta várias sugestões distintas e sem repetir profissional entre papéis', () => {
        const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 3], [Papel.EDITOR, 1]], orcamento: 1_000_000 });
        const coringa = criarProfissional({
            id: 'coringa',
            especialidades: [Papel.DIRETOR, Papel.EDITOR],
            competencias: { direcao: 10, montagem: 10, roteiro: 6, colorizacao: 7 }
        });
        const diretores = [1, 2, 3].map((i) => criarProfissional({ id: `d${i}`, competencias: { direcao: 10 - i } }));
        const editores = [1, 2, 3].map((i) =>
            criarProfissional({ id: `e${i}`, especialidades: [Papel.EDITOR], competencias: { montagem: 10 - i } })
        );
        const orquestrador = orquestradorCom([coringa, ...diretores, ...editores], 3);

        orquestrador.orquestrar(projeto, estrategia);
        const { sugestoes } = orquestrador.getResultado();

        expect(sugestoes).toHaveLength(3);
        const composicoes = sugestoes.map((e) => e.getMembros().map((m) => m.getProfissional().getId()).join(','));
        expect(new Set(composicoes).size).toBe(3);
        for (const equipe of sugestoes) {
            const ids = equipe.getMembros().map((m) => m.getProfissional().getId());
            expect(new Set(ids).size).toBe(ids.length);
            expect(equipe.estaCompleta(projeto.getPapeis())).toBe(true);
        }
    });

    it('troca membros de menor peso por opções mais baratas para caber no orçamento', () => {
        const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 3], [Papel.EDITOR, 1]], orcamento: 40_000 });
        const diretor = criarProfissional({ id: 'dir', preco: 30_000, competencias: { direcao: 10 } });
        const editorCaro = criarProfissional({
            id: 'editor-caro',
            especialidades: [Papel.EDITOR],
            preco: 20_000,
            competencias: { montagem: 10, colorizacao: 7 }
        });
        const editorBarato = criarProfissional({
            id: 'editor-barato',
            especialidades: [Papel.EDITOR],
            preco: 8_000,
            competencias: { montagem: 6 }
        });

        const equipe = orquestradorCom([diretor, editorCaro, editorBarato], 1).orquestrar(projeto, estrategia);

        expect(equipe.obterMembro(Papel.DIRETOR)?.getProfissional().getId()).toBe('dir');
        expect(equipe.obterMembro(Papel.EDITOR)?.getProfissional().getId()).toBe('editor-barato');
        expect(equipe.custoTotal()).toBeLessThanOrEqual(40_000);
    });

    it('nova rodada de um papel: mantém fixos e ignora excluídos', () => {
        const projeto = criarProjeto({ papeis: [[Papel.DIRETOR, 3], [Papel.EDITOR, 1]] });
        const diretorFixo = criarProfissional({ id: 'fixo' });
        const rejeitado = criarProfissional({ id: 'rejeitado', especialidades: [Papel.EDITOR], competencias: { montagem: 10 } });
        const alternativo = criarProfissional({ id: 'alt', especialidades: [Papel.EDITOR], competencias: { montagem: 5 } });
        const orquestrador = orquestradorCom([diretorFixo, rejeitado, alternativo]);

        const equipe = orquestrador.orquestrar(projeto, estrategia, {
            papeis: [Papel.EDITOR],
            excluidos: ['rejeitado'],
            fixos: new Map([[Papel.DIRETOR, diretorFixo]])
        });

        expect([...orquestrador.getResultado().ranking.keys()]).toEqual([Papel.EDITOR]);
        expect(equipe.obterMembro(Papel.DIRETOR)?.getProfissional()).toBe(diretorFixo);
        expect(equipe.obterMembro(Papel.EDITOR)?.getProfissional().getId()).toBe('alt');
    });

    it('usa o relógio real e 3 sugestões por padrão', () => {
        const projeto = criarProjeto({ prazo: new Date(Date.now() + 90 * 86_400_000) });
        const profissional = criarProfissional({ disponivelAte: new Date(Date.now() + 400 * 86_400_000) });
        const orquestrador = new OrquestradorPadrao(criarFabricaGeral(), [profissional]);

        orquestrador.orquestrar(projeto, estrategia);

        expect(orquestrador.getResultado().sugestoes).toHaveLength(1);
    });
});
