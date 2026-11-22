import type { Papel } from '../enums/Papel.js';

/**
 * Composite: um nó da hierarquia de serviços de um projeto. Pode ser um serviço atômico (folha)
 * ou um pacote que contém outros serviços. Os dois são tratados pela mesma interface.
 *
 * Os nós são imutáveis: um projeto clonado (Prototype) pode compartilhar a mesma árvore sem risco.
 */
export interface ServicoProjeto {
    readonly nome: string;

    /** Custo estimado do nó, somando todos os serviços abaixo dele. */
    calcularCusto(): number;

    /** Filhos diretos (vazio para um serviço atômico). */
    listarSubservicos(): readonly ServicoProjeto[];

    /** Prazo de execução, em dias. */
    obterPrazo(): number;

    /** Problemas da estrutura, percorrendo a hierarquia inteira (vazio = válida). */
    validar(): string[];

    /** Folhas da hierarquia: de onde saem os papéis técnicos do projeto. */
    listarAtomicos(): readonly ServicoAtomicoInfo[];
}

/** O que um serviço atômico expõe sobre o papel técnico que ele exige. */
export interface ServicoAtomicoInfo {
    readonly nome: string;
    readonly papel: Papel;
    /** Importância relativa do papel para o sucesso da obra (usada na verba e no ranking). */
    readonly peso: number;
}
