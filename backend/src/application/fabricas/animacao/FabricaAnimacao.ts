import { ProjetoAnimacao } from '../../../domain/entities/projetos/ProjetoAnimacao.js';
import { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { criarRegistroPrototipos } from '../../prototipos/catalogoPrototipos.js';
import type { RegistroPrototipos } from '../../prototipos/RegistroPrototipos.js';
import type { CanaisNotificador } from '../base/NotificadorTipoProjeto.js';
import { FabricaProjeto, type DadosProjeto } from '../FabricaProjeto.js';
import { NotificadorAnimacao } from './NotificadorAnimacao.js';
import { RecomendadorAnimacao } from './RecomendadorAnimacao.js';
import { RelatorioAnimacao } from './RelatorioAnimacao.js';
import { ValidadorAnimacao } from './ValidadorAnimacao.js';

export class FabricaAnimacao extends FabricaProjeto {
    readonly tipo = TipoProjeto.ANIMACAO;
    protected readonly modeloPadrao = 'animacao';
    private readonly canais: CanaisNotificador;

    constructor(canais: CanaisNotificador, prototipos: RegistroPrototipos = criarRegistroPrototipos()) {
        super(prototipos);
        this.canais = canais;
    }

    public criarProjeto(dados: DadosProjeto): ProjetoAnimacao {
        return this.clonarModelo(dados, ProjetoAnimacao, ProjetoAnimacao.lerEspecificos(dados.especificos ?? {}));
    }

    public criarValidador(): ValidadorAnimacao {
        return new ValidadorAnimacao();
    }

    public criarRecomendador(): RecomendadorAnimacao {
        return new RecomendadorAnimacao();
    }

    public criarNotificador(): NotificadorAnimacao {
        return new NotificadorAnimacao(this.canais);
    }

    public criarGeradorRelatorio(): RelatorioAnimacao {
        return new RelatorioAnimacao();
    }
}
