import { Papel } from '../../../domain/enums/Papel.js';
import type { ConfigSimilaridadeCosseno } from '../../strategies/SimilaridadeCosseno.js';
import { RecomendadorPorPerfil } from '../base/RecomendadorPorPerfil.js';

/** Valoriza pesquisa, roteiro e captação em ambiente real (luz natural, som direto). */
export class RecomendadorDocumentario extends RecomendadorPorPerfil {
    readonly nome = 'recomendador-documentario';
    readonly descricao = 'Similaridade de cosseno com perfis que priorizam pesquisa e captação documental';

    constructor(config: Partial<Omit<ConfigSimilaridadeCosseno, 'perfis'>> = {}) {
        super(
            {
                [Papel.DIRETOR]: { direcao: 10, pesquisa: 8, roteiro: 6, fotografia: 5 },
                [Papel.ROTEIRISTA]: { pesquisa: 10, roteiro: 9, direcao: 3 },
                [Papel.DIRETOR_FOTOGRAFIA]: { fotografia: 10, iluminacao: 6, direcao: 4 },
                [Papel.SONOPLASTA]: { audio: 10, mixagem: 6 }
            },
            config
        );
    }
}
