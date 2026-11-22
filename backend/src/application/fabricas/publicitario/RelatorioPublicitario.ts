import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoPublicitario } from '../../../domain/entities/projetos/ProjetoPublicitario.js';
import { formatarMoeda } from '../../visitors/formatacao.js';
import { GeradorRelatorio } from '../../visitors/GeradorRelatorio.js';
import { ValidadorPublicitario } from './ValidadorPublicitario.js';

/** Relatório da peça publicitária: cliente, veiculação e custo por segundo de peça. */
export class RelatorioPublicitario extends GeradorRelatorio {
    constructor() {
        super(new ValidadorPublicitario());
    }

    protected override secaoDoTipo(projeto: Projeto): string[] {
        if (!(projeto instanceof ProjetoPublicitario)) return [];
        const segundos = Math.round(projeto.getDuracao() * 60);
        const custoEquipe = projeto.getEquipe()?.custoTotal() ?? 0;
        return [
            `Cliente: ${projeto.getCliente()} | Veiculação: ${projeto.getVeiculacao().join(', ') || 'a definir'}`,
            `Duração da peça: ${segundos} s`,
            `Orçamento por segundo: ${formatarMoeda(projeto.getOrcamento() / segundos)}`,
            `Custo da equipe por segundo: ${formatarMoeda(custoEquipe / segundos)}`
        ];
    }
}
