import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import { rotuloPapel, type Papel } from '../../../domain/enums/Papel.js';
import type { ValidadorProjeto } from '../FabricaProjeto.js';

/** Experiência mínima (0 a 10) em uma das competências-chave do tipo para o profissional ser considerado. */
export const NIVEL_MINIMO_PADRAO = 3;

/**
 * Base dos validadores de cada tipo. O projeto precisa ser da classe esperada:
 * isso impede misturar, por exemplo, um projeto de animação com o validador de documentário.
 */
export abstract class ValidadorTipoProjeto<P extends Projeto> implements ValidadorProjeto {
    private problemas: string[] = [];
    protected readonly nivelMinimo: number;

    constructor(nivelMinimo: number = NIVEL_MINIMO_PADRAO) {
        this.nivelMinimo = nivelMinimo;
    }

    /** Nome do tipo usado nas mensagens. */
    protected abstract readonly descricaoTipo: string;

    /** Competências que contam como experiência no tipo (vazio = qualquer profissional serve). */
    protected abstract readonly competenciasChave: readonly string[];

    protected abstract ehDoTipo(projeto: Projeto): projeto is P;

    /** Regras específicas do tipo. Retorna a lista de problemas (vazia = válido). */
    protected abstract regras(projeto: P): string[];

    public getProblemas(): readonly string[] {
        return this.problemas;
    }

    public visitarProjeto(projeto: Projeto): boolean {
        this.problemas = this.ehDoTipo(projeto)
            ? this.regras(projeto)
            : [`o projeto não é do tipo ${this.descricaoTipo}: use a fábrica correspondente`];
        return this.problemas.length === 0;
    }

    public visitarProfissional(profissional: Profissional): boolean {
        return (
            this.competenciasChave.length === 0 ||
            this.competenciasChave.some((competencia) => profissional.nivelEm(competencia) >= this.nivelMinimo)
        );
    }

    /** Problemas para cada papel exigido pelo tipo que o projeto não incluiu. */
    protected exigirPapeis(projeto: Projeto, papeis: readonly Papel[], motivo: string): string[] {
        return papeis
            .filter((papel) => !projeto.exigePapel(papel))
            .map((papel) => `${this.descricaoTipo} precisa do papel ${rotuloPapel(papel)} (${motivo})`);
    }
}
