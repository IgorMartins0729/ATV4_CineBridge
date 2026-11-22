import { ProjetoPublicitario } from '../../../domain/entities/projetos/ProjetoPublicitario.js';
import { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { criarRegistroPrototipos } from '../../prototipos/catalogoPrototipos.js';
import type { RegistroPrototipos } from '../../prototipos/RegistroPrototipos.js';
import type { CanaisNotificador } from '../base/NotificadorTipoProjeto.js';
import { FabricaProjeto, type DadosProjeto } from '../FabricaProjeto.js';
import { NotificadorPublicitario } from './NotificadorPublicitario.js';
import { RecomendadorPublicitario } from './RecomendadorPublicitario.js';
import { RelatorioPublicitario } from './RelatorioPublicitario.js';
import { ValidadorPublicitario } from './ValidadorPublicitario.js';

export class FabricaPublicitario extends FabricaProjeto {
    readonly tipo = TipoProjeto.PUBLICITARIO;
    protected readonly modeloPadrao = 'publicitario';
    private readonly canais: CanaisNotificador;

    constructor(canais: CanaisNotificador, prototipos: RegistroPrototipos = criarRegistroPrototipos()) {
        super(prototipos);
        this.canais = canais;
    }

    public criarProjeto(dados: DadosProjeto): ProjetoPublicitario {
        return this.clonarModelo(dados, ProjetoPublicitario, ProjetoPublicitario.lerEspecificos(dados.especificos ?? {}));
    }

    public criarValidador(): ValidadorPublicitario {
        return new ValidadorPublicitario();
    }

    public criarRecomendador(): RecomendadorPublicitario {
        return new RecomendadorPublicitario();
    }

    public criarNotificador(): NotificadorPublicitario {
        return new NotificadorPublicitario(this.canais);
    }

    public criarGeradorRelatorio(): RelatorioPublicitario {
        return new RelatorioPublicitario();
    }
}
