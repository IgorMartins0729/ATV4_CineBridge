import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ValidadorTipoProjeto } from '../base/ValidadorTipoProjeto.js';

/** Projeto geral (modelo da ATV1): sem regras além das do orquestrador; qualquer profissional serve. */
export class ValidadorGeral extends ValidadorTipoProjeto<Projeto> {
    protected readonly descricaoTipo = 'geral';
    protected readonly competenciasChave: readonly string[] = [];

    protected ehDoTipo(_projeto: Projeto): _projeto is Projeto {
        return true;
    }

    protected regras(): string[] {
        return [];
    }
}
