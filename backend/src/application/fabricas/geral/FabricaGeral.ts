import { Projeto } from '../../../domain/entities/Projeto.js';
import { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { criarRegistroPrototipos } from '../../prototipos/catalogoPrototipos.js';
import type { RegistroPrototipos } from '../../prototipos/RegistroPrototipos.js';
import type { RecomendacaoStrategy } from '../../strategies/RecomendacaoStrategy.js';
import { GeradorRelatorio } from '../../visitors/GeradorRelatorio.js';
import type { CanaisNotificador } from '../base/NotificadorTipoProjeto.js';
import { FabricaProjeto, type DadosProjeto } from '../FabricaProjeto.js';
import { NotificadorGeral } from './NotificadorGeral.js';
import { ValidadorGeral } from './ValidadorGeral.js';

/** Família do projeto geral (ficção, longas): mantém o comportamento da ATV1. */
export class FabricaGeral extends FabricaProjeto {
    readonly tipo = TipoProjeto.GERAL;
    protected readonly modeloPadrao = 'geral';
    private readonly canais: CanaisNotificador;
    private readonly recomendador: RecomendacaoStrategy;

    constructor(
        canais: CanaisNotificador,
        recomendador: RecomendacaoStrategy,
        prototipos: RegistroPrototipos = criarRegistroPrototipos()
    ) {
        super(prototipos);
        this.canais = canais;
        this.recomendador = recomendador;
    }

    public criarProjeto(dados: DadosProjeto): Projeto {
        return this.clonarModelo(dados, Projeto, {});
    }

    public criarValidador(): ValidadorGeral {
        return new ValidadorGeral();
    }

    public criarRecomendador(): RecomendacaoStrategy {
        return this.recomendador;
    }

    public criarNotificador(): NotificadorGeral {
        return new NotificadorGeral(this.canais);
    }

    public criarGeradorRelatorio(): GeradorRelatorio {
        return new GeradorRelatorio(new ValidadorGeral());
    }
}
