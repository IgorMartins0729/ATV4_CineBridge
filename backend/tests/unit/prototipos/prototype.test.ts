import { describe, expect, it } from 'vitest';
import { criarRegistroPrototipos, PROTOTIPOS } from '../../../src/application/prototipos/catalogoPrototipos.js';
import { Equipe } from '../../../src/domain/entities/Equipe.js';
import { Projeto } from '../../../src/domain/entities/Projeto.js';
import { ProjetoAnimacao } from '../../../src/domain/entities/projetos/ProjetoAnimacao.js';
import { ProjetoDocumentario } from '../../../src/domain/entities/projetos/ProjetoDocumentario.js';
import { ProjetoPublicitario } from '../../../src/domain/entities/projetos/ProjetoPublicitario.js';
import { restaurarProjeto } from '../../../src/domain/entities/projetos/restaurarProjeto.js';
import { Papel } from '../../../src/domain/enums/Papel.js';
import { TipoCaptacao } from '../../../src/domain/enums/TipoCaptacao.js';
import { TipoProjeto } from '../../../src/domain/enums/TipoProjeto.js';
import { ValidacaoError } from '../../../src/domain/erros.js';
import { Localizacao } from '../../../src/domain/value-objects/Localizacao.js';
import { RequisitoPapel } from '../../../src/domain/value-objects/RequisitoPapel.js';
import { criarProfissional, criarProjeto, PRAZO_PADRAO } from '../../fixtures/fabricas.js';
import { pacoteDePapeis } from '../../../src/domain/servicos/serializacao.js';

function documentario(): ProjetoDocumentario {
    return PROTOTIPOS.documentario().clonar({
        id: 'doc-1',
        titulo: 'Vozes do Sertão',
        tema: 'Seca no Nordeste',
        entrevistados: ['Dona Maria', 'Seu João']
    });
}

describe('Prototype: clonar() devolve uma cópia profunda', () => {
    it('o clone é da mesma subclasse e tem os mesmos dados, mas é outro objeto', () => {
        const original = documentario();
        const clone = original.clonar();

        expect(clone).toBeInstanceOf(ProjetoDocumentario);
        expect(clone).not.toBe(original);
        expect(clone.getId()).toBe(original.getId());
        expect(clone.getTema()).toBe('Seca no Nordeste');
        expect(clone.getEntrevistados()).toEqual(['Dona Maria', 'Seu João']);
        expect(clone.getPapeis()).toEqual(original.getPapeis());
        expect(clone.getTipoCaptacao()).toBe(TipoCaptacao.DOCUMENTARIO);
    });

    it('nenhum objeto agregado é compartilhado: papéis, localização, listas e produtor', () => {
        const original = documentario();
        const clone = original.clonar();

        expect(clone.getPapeisObrigatorios()).not.toBe(original.getPapeisObrigatorios());
        clone.getPapeisObrigatorios().forEach((r, i) => expect(r).not.toBe(original.getPapeisObrigatorios()[i]));
        expect(clone.getLocalizacao()).not.toBe(original.getLocalizacao());
        expect(clone.getEntrevistados()).not.toBe(original.getEntrevistados());
        expect(clone.getProdutor()).not.toBe(original.getProdutor());
    });

    it('alterar o clone não altera o original (orçamento, prazo, equipe e rejeitados)', () => {
        const diretor = criarProfissional({ especialidades: [Papel.DIRETOR] });
        const original = documentario();
        original.aceitarRecomendacao(Papel.DIRETOR, diretor);

        const clone = original.clonar();
        clone.alterarOrcamento(999_999);
        clone.alterarPrazo(new Date('2030-01-01'));
        clone.rejeitarMembro(Papel.DIRETOR);

        expect(original.getOrcamento()).not.toBe(999_999);
        expect(original.getPrazo().getFullYear()).not.toBe(2030);
        expect(original.getEquipe()?.obterMembro(Papel.DIRETOR)?.getProfissional()).toBe(diretor);
        expect(original.getProfissionaisRejeitados().size).toBe(0);
        expect(clone.getProfissionaisRejeitados().has(diretor.getId())).toBe(true);
    });

    it('a equipe clonada preserva confirmações sem compartilhar os membros', () => {
        const diretor = criarProfissional({ especialidades: [Papel.DIRETOR] });
        const equipe = new Equipe();
        equipe.definirMembro(Papel.DIRETOR, diretor);
        equipe.confirmarMembro(Papel.DIRETOR, diretor.getId());

        const copia = equipe.clonar();

        expect(copia.getId()).toBe(equipe.getId());
        expect(copia.obterMembro(Papel.DIRETOR)).not.toBe(equipe.obterMembro(Papel.DIRETOR));
        expect(copia.obterMembro(Papel.DIRETOR)?.getConfirmado()).toBe(true);
    });

    it('aceita ajustes finos nos atributos comuns e nos específicos', () => {
        const animacao = PROTOTIPOS.animacao().clonar({
            titulo: 'Robôs de Papel',
            tecnica: 'STOP_MOTION',
            softwares: ['Dragonframe'],
            servicoPrincipal: pacoteDePapeis([new RequisitoPapel(Papel.EFEITOS_VISUAIS, 2)])
        });

        expect(animacao).toBeInstanceOf(ProjetoAnimacao);
        expect(animacao.getTitulo()).toBe('Robôs de Papel');
        expect(animacao.getTecnica()).toBe('STOP_MOTION');
        expect(animacao.getSoftwares()).toEqual(['Dragonframe']);
        expect(animacao.getPapeis()).toEqual([Papel.EFEITOS_VISUAIS]);
        expect(animacao.getTipoCaptacao()).toBe(TipoCaptacao.ANIMACAO);
    });

    it('o projeto geral (ATV1) também é clonável', () => {
        const original = criarProjeto({ titulo: 'Curta' });
        const clone = original.clonar({ titulo: 'Curta 2' });

        expect(clone).toBeInstanceOf(Projeto);
        expect(clone.getTipo()).toBe(TipoProjeto.GERAL);
        expect(clone.getTitulo()).toBe('Curta 2');
        expect(original.getTitulo()).toBe('Curta');
    });

    it('cada subclasse valida os seus atributos obrigatórios', () => {
        expect(() => PROTOTIPOS.documentario().clonar({ tema: '  ' })).toThrow(ValidacaoError);
        expect(() => PROTOTIPOS.publicitario().clonar({ cliente: '' })).toThrow(ValidacaoError);
        expect(() => ProjetoAnimacao.lerEspecificos({ tecnica: '4D' })).toThrow(ValidacaoError);
        expect(() => ProjetoDocumentario.lerEspecificos({ entrevistados: 'um só' })).toThrow(ValidacaoError);
        expect(() => ProjetoPublicitario.lerEspecificos({ cliente: 10 })).toThrow(ValidacaoError);
    });
});

describe('RegistroPrototipos: modelos pré-configurados', () => {
    it('entrega sempre um clone novo do modelo, sem alterar o original', () => {
        const registro = criarRegistroPrototipos();
        const primeiro = registro.clonar('publicitario', { id: 'p1', titulo: 'Campanha de verão' });
        const segundo = registro.clonar('publicitario');

        expect(registro.nomes()).toEqual([
            'geral',
            'documentario',
            'animacao',
            'publicitario',
            'documentario-curta',
            'animacao-stop-motion',
            'publicidade-tv'
        ]);
        expect(primeiro).toBeInstanceOf(ProjetoPublicitario);
        expect(primeiro.getTitulo()).toBe('Campanha de verão');
        expect(segundo.getTitulo()).toBe('Modelo');
        expect(primeiro).not.toBe(segundo);
    });

    it('modelo inexistente gera erro com as opções', () => {
        expect(() => criarRegistroPrototipos().clonar('vr')).toThrow(/Opções: geral, documentario/);
        expect(() => criarRegistroPrototipos().clonar('vr')).toThrow(ValidacaoError);
    });

    it('as variações são clones ajustados do modelo base e listam descrição e tipo', () => {
        const registro = criarRegistroPrototipos();
        const curta = registro.clonar('documentario-curta') as ProjetoDocumentario;

        expect(curta).toBeInstanceOf(ProjetoDocumentario);
        expect(curta.getDuracao()).toBe(20);
        expect(curta.getPapeis()).toEqual([Papel.DIRETOR, Papel.ROTEIRISTA, Papel.EDITOR]);
        expect(registro.existe('publicidade-tv')).toBe(true);
        expect(registro.tipoDe('animacao-stop-motion')).toBe(TipoProjeto.ANIMACAO);
        expect(registro.listar(TipoProjeto.DOCUMENTARIO).map((m) => m.nome)).toEqual(['documentario', 'documentario-curta']);
        expect(registro.listar().every((m) => m.descricao.length > 0)).toBe(true);
    });
});

describe('restaurarProjeto: recria a subclasse a partir do que foi gravado', () => {
    it.each([
        [TipoProjeto.GERAL, Projeto, {}],
        [TipoProjeto.DOCUMENTARIO, ProjetoDocumentario, { tema: 'Rios', entrevistados: ['Ana'] }],
        [TipoProjeto.ANIMACAO, ProjetoAnimacao, { tecnica: '2D', softwares: ['Krita'] }],
        [TipoProjeto.PUBLICITARIO, ProjetoPublicitario, { cliente: 'Café Bom', veiculacao: ['TV'] }]
    ] as const)('%s', (tipo, classe, especificos) => {
        const props = {
            id: 'gravado-1',
            titulo: 'Projeto gravado',
            produtor: { id: 'produtor-1', nome: 'Ana', email: 'ana@produtora.test' },
            genero: 'drama',
            duracao: 3,
            orcamento: 100_000,
            prazo: PRAZO_PADRAO,
            tipoCaptacao: TipoCaptacao.FICCAO,
            localizacao: new Localizacao('Recife', 'PE'),
            servicoPrincipal: pacoteDePapeis([new RequisitoPapel(Papel.DIRETOR, 1)])
        };
        const restaurado = restaurarProjeto(tipo, props, especificos);

        expect(restaurado).toBeInstanceOf(classe);
        expect(restaurado.getTipo()).toBe(tipo);
        expect(restaurado.getEspecificos()).toEqual(especificos);
    });
});
