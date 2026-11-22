import type { Projeto } from '../../domain/entities/Projeto.js';
import { TipoProjeto } from '../../domain/enums/TipoProjeto.js';
import { NaoEncontradoError } from '../../domain/erros.js';
import type { DadosProjeto } from '../fabricas/FabricaProjeto.js';
import type { RegistroFabricas } from '../fabricas/RegistroFabricas.js';
import type { IProjetoRepository } from '../ports/IProjetoRepository.js';
import type { RegistroPrototipos } from '../prototipos/RegistroPrototipos.js';
import type { RegistroEstrategias } from '../strategies/RegistroEstrategias.js';

export interface NovoProjeto extends DadosProjeto {
    /** Tipo do projeto. Define qual fábrica cria o projeto. Padrão: o tipo do modelo escolhido, ou GERAL. */
    tipoProjeto?: TipoProjeto | undefined;
}

export class ProjetoService {
    private readonly projetos: IProjetoRepository;
    private readonly estrategias: RegistroEstrategias;
    private readonly fabricas: RegistroFabricas;
    private readonly prototipos: RegistroPrototipos;

    constructor(deps: {
        projetos: IProjetoRepository;
        estrategias: RegistroEstrategias;
        fabricas: RegistroFabricas;
        prototipos: RegistroPrototipos;
    }) {
        this.projetos = deps.projetos;
        this.estrategias = deps.estrategias;
        this.fabricas = deps.fabricas;
        this.prototipos = deps.prototipos;
    }

    /** Cria e grava o projeto. */
    public async criar(dados: NovoProjeto): Promise<Projeto> {
        const projeto = this.montar(dados);
        await this.projetos.salvar(projeto);
        return projeto;
    }

    /** Cria o projeto sem gravar: a fábrica do tipo clona o protótipo correspondente e aplica os dados. */
    public montar(dados: NovoProjeto): Projeto {
        if (dados.estrategia) {
            this.estrategias.obter(dados.estrategia);
        }
        const tipo = dados.tipoProjeto ?? (dados.modelo ? this.prototipos.tipoDe(dados.modelo) : TipoProjeto.GERAL);
        return this.fabricas.obter(tipo).criarProjeto(dados);
    }

    public async buscar(id: string): Promise<Projeto> {
        const projeto = await this.projetos.buscarPorId(id);
        if (!projeto) {
            throw new NaoEncontradoError(`Projeto ${id} não encontrado`);
        }
        return projeto;
    }
}
