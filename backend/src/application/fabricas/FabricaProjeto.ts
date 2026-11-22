import { randomUUID } from 'node:crypto';
import type { Projeto, ProjetoProps } from '../../domain/entities/Projeto.js';
import type { Papel } from '../../domain/enums/Papel.js';
import type { TipoCaptacao } from '../../domain/enums/TipoCaptacao.js';
import type { TipoProjeto } from '../../domain/enums/TipoProjeto.js';
import { ValidacaoError } from '../../domain/erros.js';
import { pacoteDePapeis } from '../../domain/servicos/serializacao.js';
import type { ServicoProjeto } from '../../domain/servicos/ServicoProjeto.js';
import { Localizacao } from '../../domain/value-objects/Localizacao.js';
import type { Produtor } from '../../domain/value-objects/Produtor.js';
import { RequisitoPapel } from '../../domain/value-objects/RequisitoPapel.js';
import type { VisitanteProjeto } from '../../domain/visitors/VisitanteProjeto.js';
import type { Observador } from '../observers/Observador.js';
import type { RegistroPrototipos } from '../prototipos/RegistroPrototipos.js';
import type { ValidadorProjeto } from '../visitors/ValidadorProjeto.js';
import type { RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy.js';

/** Dados para criar um projeto. O que não vier é herdado do protótipo do tipo (modelo pré-configurado). */
export interface DadosProjeto {
    titulo: string;
    produtor: Produtor;
    orcamento: number;
    prazo: Date;
    localizacao: { cidade: string; uf: string };
    genero?: string | undefined;
    duracao?: number | undefined;
    tipoCaptacao?: TipoCaptacao | undefined;
    /** Composite: hierarquia de serviços. Substitui a lista de papéis do modelo. */
    servicoPrincipal?: ServicoProjeto | undefined;
    /** Formato antigo (ATV I/II): lista simples de papéis, convertida em um pacote de serviços. */
    papeisObrigatorios?: Array<{ papel: Papel; peso: number }> | undefined;
    estrategia?: string | null | undefined;
    /** Nome do modelo pré-configurado (protótipo) a clonar. Padrão: o modelo principal do tipo. */
    modelo?: string | undefined;
    /** Atributos próprios do tipo (ex.: tema do documentário, técnica da animação). */
    especificos?: Readonly<Record<string, unknown>> | undefined;
}

export type { ValidadorProjeto } from '../visitors/ValidadorProjeto.js';

/**
 * Abstract Factory: cria a família completa de objetos de um tipo de projeto
 * (projeto, validador, recomendador e notificador), garantindo que eles combinem entre si.
 * Cada método `criar*` é um Factory Method: a fábrica concreta decide qual classe instanciar.
 */
export abstract class FabricaProjeto {
    public abstract readonly tipo: TipoProjeto;
    /** Modelo usado quando os dados não escolhem um. */
    protected abstract readonly modeloPadrao: string;
    protected readonly prototipos: RegistroPrototipos;

    constructor(prototipos: RegistroPrototipos) {
        this.prototipos = prototipos;
    }

    public abstract criarProjeto(dados: DadosProjeto): Projeto;

    public abstract criarValidador(): ValidadorProjeto;

    public abstract criarRecomendador(): RecomendacaoStrategy;

    public abstract criarNotificador(): Observador;

    /** Relatório para o produtor com as métricas próprias do tipo. */
    public abstract criarGeradorRelatorio(): VisitanteProjeto<string>;

    /**
     * Prototype: clona o modelo escolhido aplicando os dados recebidos. Recusa um modelo de outro tipo
     * (ex.: o modelo de animação pedido à fábrica de documentário).
     */
    protected clonarModelo<P extends Projeto>(
        dados: DadosProjeto,
        classe: abstract new (...args: never[]) => P,
        especificos: object
    ): P {
        const nome = dados.modelo ?? this.modeloPadrao;
        if (this.prototipos.tipoDe(nome) !== this.tipo) {
            throw new ValidacaoError(`O modelo "${nome}" não é um projeto do tipo ${this.tipo}`);
        }
        const projeto = this.prototipos.clonar(nome, { ...this.ajustesComuns(dados), ...especificos });
        if (!(projeto instanceof classe)) {
            throw new ValidacaoError(`O modelo "${nome}" não é um projeto do tipo ${this.tipo}`);
        }
        return projeto;
    }

    /** Converte os dados comuns em ajustes do protótipo. O id é sempre novo: cada clone é um projeto novo. */
    protected ajustesComuns(dados: DadosProjeto): Partial<ProjetoProps> {
        if (dados.servicoPrincipal !== undefined && dados.papeisObrigatorios !== undefined) {
            throw new ValidacaoError('Envie "servicoPrincipal" ou "papeisObrigatorios", não os dois');
        }
        const servicoPrincipal =
            dados.servicoPrincipal ??
            (dados.papeisObrigatorios !== undefined
                ? pacoteDePapeis(dados.papeisObrigatorios.map((r) => new RequisitoPapel(r.papel, r.peso)))
                : undefined);
        return {
            id: randomUUID(),
            titulo: dados.titulo,
            produtor: { ...dados.produtor },
            orcamento: dados.orcamento,
            prazo: new Date(dados.prazo),
            localizacao: new Localizacao(dados.localizacao.cidade, dados.localizacao.uf),
            estrategia: dados.estrategia ?? null,
            ...(dados.genero !== undefined ? { genero: dados.genero } : {}),
            ...(dados.duracao !== undefined ? { duracao: dados.duracao } : {}),
            ...(dados.tipoCaptacao !== undefined ? { tipoCaptacao: dados.tipoCaptacao } : {}),
            ...(servicoPrincipal !== undefined ? { servicoPrincipal } : {})
        };
    }
}
