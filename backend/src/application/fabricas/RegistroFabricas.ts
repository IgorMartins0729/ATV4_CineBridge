import type { Projeto } from '../../domain/entities/Projeto.js';
import type { TipoProjeto } from '../../domain/enums/TipoProjeto.js';
import { ValidacaoError } from '../../domain/erros.js';
import type { FabricaProjeto } from './FabricaProjeto.js';

/** Escolhe a fábrica pelo tipo do projeto. Um tipo novo só precisa ser registrado aqui (no container). */
export class RegistroFabricas {
    private readonly fabricas = new Map<TipoProjeto, FabricaProjeto>();

    constructor(fabricas: readonly FabricaProjeto[]) {
        for (const fabrica of fabricas) {
            this.registrar(fabrica);
        }
    }

    public registrar(fabrica: FabricaProjeto): void {
        this.fabricas.set(fabrica.tipo, fabrica);
    }

    public obter(tipo: TipoProjeto): FabricaProjeto {
        const fabrica = this.fabricas.get(tipo);
        if (!fabrica) {
            throw new ValidacaoError(`Tipo de projeto sem fábrica registrada: "${tipo}". Opções: ${this.tipos().join(', ')}`);
        }
        return fabrica;
    }

    public paraProjeto(projeto: Projeto): FabricaProjeto {
        return this.obter(projeto.getTipo());
    }

    public tipos(): TipoProjeto[] {
        return [...this.fabricas.keys()];
    }
}
