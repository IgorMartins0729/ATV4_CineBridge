import { Papel } from '../../../domain/enums/Papel.js';
import type { ConfigSimilaridadeCosseno } from '../../strategies/SimilaridadeCosseno.js';
import { RecomendadorPorPerfil } from '../base/RecomendadorPorPerfil.js';

/** Valoriza acabamento visual: fotografia, iluminação, montagem e colorização. */
export class RecomendadorPublicitario extends RecomendadorPorPerfil {
    readonly nome = 'recomendador-publicitario';
    readonly descricao = 'Similaridade de cosseno com perfis que priorizam acabamento visual (fotografia e color)';

    constructor(config: Partial<Omit<ConfigSimilaridadeCosseno, 'perfis'>> = {}) {
        super(
            {
                [Papel.DIRETOR]: { direcao: 10, fotografia: 7, colorizacao: 5 },
                [Papel.DIRETOR_FOTOGRAFIA]: { fotografia: 10, iluminacao: 10, colorizacao: 6 },
                [Papel.EDITOR]: { montagem: 10, colorizacao: 9, efeitos: 6, audio: 3 },
                [Papel.EFEITOS_VISUAIS]: { efeitos: 10, colorizacao: 7, animacao3d: 5 }
            },
            config
        );
    }
}
