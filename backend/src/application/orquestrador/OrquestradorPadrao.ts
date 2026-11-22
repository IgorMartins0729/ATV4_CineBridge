import type { Profissional } from '../../domain/entities/Profissional.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import type { Papel } from '../../domain/enums/Papel.js';
import type { FabricaProjeto } from '../fabricas/FabricaProjeto.js';
import { OrquestradorEquipe, type ConfigOrquestrador } from './OrquestradorEquipe.js';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ConfigOrquestradorPadrao extends ConfigOrquestrador {
    /** Relógio injetável, para os testes não dependerem da data atual. */
    relogio: () => Date;
}

export class OrquestradorPadrao extends OrquestradorEquipe {
    private readonly relogio: () => Date;

    constructor(
        fabrica: FabricaProjeto,
        candidatos: readonly Profissional[],
        config: Partial<ConfigOrquestradorPadrao> = {}
    ) {
        super(fabrica, candidatos, { quantidadeSugestoes: config.quantidadeSugestoes ?? 3 });
        this.relogio = config.relogio ?? (() => new Date());
    }

    protected validarRestricoes(projeto: Projeto): boolean {
        const problemas: string[] = [];
        const diasAteEntrega = (projeto.getPrazo().getTime() - this.relogio().getTime()) / DIA_MS;
        const prazoServicos = projeto.getServicoPrincipal().obterPrazo();
        if (diasAteEntrega <= 0) {
            problemas.push('a data de entrega precisa ser futura');
        } else if (prazoServicos > diasAteEntrega) {
            // Composite: o prazo vem da hierarquia inteira (etapas em sequência somam, simultâneas não).
            problemas.push(
                `os serviços precisam de ${prazoServicos} dias, mas faltam ${Math.floor(diasAteEntrega)} até a entrega`
            );
        }
        if (projeto.estaFormada()) {
            problemas.push('a equipe do projeto já foi formada');
        }
        const menorVerba = Math.min(...projeto.getPapeis().map((papel) => projeto.verbaDoPapel(papel)));
        if (menorVerba < 1) {
            problemas.push('orçamento insuficiente para dividir entre os papéis');
        }
        problemas.forEach((problema) => this.reportarProblema(problema));
        return problemas.length === 0;
    }

    /** Remove duplicados e quem não pode participar: sem papel no projeto, indisponível no prazo ou mais caro que o orçamento. */
    protected normalizarDados(projeto: Projeto, profissionais: readonly Profissional[]): Profissional[] {
        const papeis = new Set(projeto.getPapeis());
        const prazo = projeto.getPrazo();
        const orcamento = projeto.getOrcamento();
        const vistos = new Set<string>();
        return profissionais.filter((profissional) => {
            if (vistos.has(profissional.getId())) return false;
            vistos.add(profissional.getId());
            return (
                profissional.getEspecialidades().some((papel) => papeis.has(papel)) &&
                profissional.estaDisponivelEm(prazo) &&
                profissional.getPrecoMedio() <= orcamento
            );
        });
    }

    /** Descarta quem teve pontuação zero (sem nenhuma aderência), mantendo a ordem da estratégia. */
    protected posProcessar(recomendacoes: Map<Papel, Profissional[]>): Map<Papel, Profissional[]> {
        return new Map(
            [...recomendacoes].map(([papel, lista]) => [papel, lista.filter((p) => this.pontuacaoDe(papel, p) > 0)])
        );
    }
}
