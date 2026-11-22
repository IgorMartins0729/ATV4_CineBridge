import { describe, expect, it } from 'vitest';
import { FabricaAnimacao } from '../../../src/application/fabricas/animacao/FabricaAnimacao.js';
import { estimarRender, RelatorioAnimacao } from '../../../src/application/fabricas/animacao/RelatorioAnimacao.js';
import { FabricaDocumentario } from '../../../src/application/fabricas/documentario/FabricaDocumentario.js';
import type { DadosProjeto } from '../../../src/application/fabricas/FabricaProjeto.js';
import { FabricaPublicitario } from '../../../src/application/fabricas/publicitario/FabricaPublicitario.js';
import { PROTOTIPOS } from '../../../src/application/prototipos/catalogoPrototipos.js';
import { GeradorRelatorio } from '../../../src/application/visitors/GeradorRelatorio.js';
import { Papel } from '../../../src/domain/enums/Papel.js';
import { criarProfissional, criarProjeto, PRAZO_PADRAO } from '../../fixtures/fabricas.js';
import { criarCanais } from '../../fixtures/sistema.js';

function dados(extra: Partial<DadosProjeto> = {}): DadosProjeto {
    return {
        titulo: 'Relatório de teste',
        produtor: { id: 'produtor-1', nome: 'Ana Produtora', email: 'ana@produtora.test' },
        orcamento: 300_000,
        prazo: PRAZO_PADRAO,
        localizacao: { cidade: 'Recife', uf: 'PE' },
        ...extra
    };
}

describe('Relatório por tipo (produto da fábrica)', () => {
    it('documentário: tema, entrevistados e experiência documental da equipe', () => {
        const fabrica = new FabricaDocumentario(criarCanais());
        const projeto = fabrica.criarProjeto(dados({ especificos: { tema: 'Rios', entrevistados: ['Ana', 'Bia'] } }));
        projeto.aceitarRecomendacao(
            Papel.DIRETOR,
            criarProfissional({ competencias: { direcao: 8, documentario: 6, pesquisa: 8 } })
        );

        const relatorio = projeto.aceitar(fabrica.criarGeradorRelatorio());

        expect(relatorio).toContain('Tipo: DOCUMENTARIO | tema: Rios | entrevistados: Ana, Bia');
        expect(relatorio).toContain('MÉTRICAS DO TIPO (DOCUMENTARIO)');
        expect(relatorio).toContain('Entrevistados previstos: 2 (Ana, Bia)');
        expect(relatorio).toContain('Experiência documental média da equipe: 6.0/10 | pesquisa: 8.0/10');
    });

    it('documentário sem roteirista aparece como inconsistente pelas regras do tipo', () => {
        const fabrica = new FabricaDocumentario(criarCanais());
        const projeto = fabrica.criarProjeto(
            dados({ papeisObrigatorios: [{ papel: Papel.DIRETOR, peso: 1 }], especificos: { tema: 'Rios' } })
        );

        const relatorio = projeto.aceitar(fabrica.criarGeradorRelatorio());

        expect(relatorio).toContain('Consistência: com problemas');
        expect(relatorio).toContain('documentário precisa do papel Roteiro');
        expect(relatorio).toContain('Experiência documental da equipe: sem equipe');
    });

    it('animação 3D: métricas de eficiência de renderização', () => {
        const fabrica = new FabricaAnimacao(criarCanais());
        const projeto = fabrica.criarProjeto(dados({ duracao: 10, especificos: { tecnica: '3D', softwares: ['Blender'] } }));
        projeto.aceitarRecomendacao(
            Papel.EFEITOS_VISUAIS,
            criarProfissional({ especialidades: [Papel.EFEITOS_VISUAIS], competencias: { animacao3d: 8 } })
        );

        const relatorio = projeto.aceitar(fabrica.criarGeradorRelatorio());

        // 10 min x 60 s x 24 qps = 14.400 quadros; x 4 min/quadro = 960 h; equipe nível 8 -> 40% de ganho -> 576 h
        expect(relatorio).toContain('Quadros: 14.400 (24 qps)');
        expect(relatorio).toContain('Eficiência de render da equipe: 80%');
        expect(relatorio).toContain('Render estimado: 576 h (sem o ganho da equipe: 960 h)');
    });

    it('estimativa de render: stop-motion não tem render digital; sem equipe não há ganho', () => {
        const stopMotion = PROTOTIPOS['animacao-stop-motion']();
        expect(estimarRender(stopMotion, 9)).toMatchObject({ quadros: 12 * 60 * 12, horasBase: 0, horasEstimadas: 0 });
        expect(stopMotion.aceitar(new RelatorioAnimacao())).toContain('sem render digital');

        const tresD = PROTOTIPOS.animacao().clonar({ duracao: 1 });
        const semEquipe = estimarRender(tresD, null);
        expect(semEquipe.eficienciaEquipe).toBe(0);
        expect(semEquipe.horasEstimadas).toBe(semEquipe.horasBase);
    });

    it('publicitário: cliente, veiculação e custo por segundo', () => {
        const fabrica = new FabricaPublicitario(criarCanais());
        const projeto = fabrica.criarProjeto(
            dados({ orcamento: 60_000, modelo: 'publicidade-tv', especificos: { cliente: 'Café Bom' } })
        );
        projeto.aceitarRecomendacao(Papel.DIRETOR, criarProfissional({ preco: 15_000 }));

        const relatorio = projeto.aceitar(fabrica.criarGeradorRelatorio());

        expect(relatorio).toContain('Cliente: Café Bom | Veiculação: TV');
        expect(relatorio).toContain('Duração da peça: 30 s');
        expect(relatorio).toContain('Orçamento por segundo: R$');
        expect(relatorio).toContain('Custo da equipe por segundo: R$');
    });

    it('um relatório de tipo não acrescenta métricas a um projeto de outro tipo', () => {
        const geral = criarProjeto();
        const relatorio = geral.aceitar(new RelatorioAnimacao());
        expect(relatorio).not.toContain('MÉTRICAS DO TIPO');
        expect(geral.aceitar(new GeradorRelatorio())).toContain('Tipo: GERAL');
    });
});
