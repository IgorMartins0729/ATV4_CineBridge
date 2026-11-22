import { ProjetoDocumentario } from '../../../domain/entities/projetos/ProjetoDocumentario.js';
import { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { criarRegistroPrototipos } from '../../prototipos/catalogoPrototipos.js';
import type { RegistroPrototipos } from '../../prototipos/RegistroPrototipos.js';
import type { CanaisNotificador } from '../base/NotificadorTipoProjeto.js';
import { FabricaProjeto, type DadosProjeto } from '../FabricaProjeto.js';
import { NotificadorDocumentario } from './NotificadorDocumentario.js';
import { RecomendadorDocumentario } from './RecomendadorDocumentario.js';
import { RelatorioDocumentario } from './RelatorioDocumentario.js';
import { ValidadorDocumentario } from './ValidadorDocumentario.js';

export class FabricaDocumentario extends FabricaProjeto {
    readonly tipo = TipoProjeto.DOCUMENTARIO;
    protected readonly modeloPadrao = 'documentario';
    private readonly canais: CanaisNotificador;

    constructor(canais: CanaisNotificador, prototipos: RegistroPrototipos = criarRegistroPrototipos()) {
        super(prototipos);
        this.canais = canais;
    }

    public criarProjeto(dados: DadosProjeto): ProjetoDocumentario {
        return this.clonarModelo(dados, ProjetoDocumentario, ProjetoDocumentario.lerEspecificos(dados.especificos ?? {}));
    }

    public criarValidador(): ValidadorDocumentario {
        return new ValidadorDocumentario();
    }

    public criarRecomendador(): RecomendadorDocumentario {
        return new RecomendadorDocumentario();
    }

    public criarNotificador(): NotificadorDocumentario {
        return new NotificadorDocumentario(this.canais);
    }

    public criarGeradorRelatorio(): RelatorioDocumentario {
        return new RelatorioDocumentario();
    }
}
