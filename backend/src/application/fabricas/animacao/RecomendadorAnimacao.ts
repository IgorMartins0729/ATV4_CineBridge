import { Papel } from '../../../domain/enums/Papel.js';
import type { ConfigSimilaridadeCosseno } from '../../strategies/SimilaridadeCosseno.js';
import { RecomendadorPorPerfil } from '../base/RecomendadorPorPerfil.js';

/** Prioriza habilidades em modelagem/animação 3D em todos os papéis criativos. */
export class RecomendadorAnimacao extends RecomendadorPorPerfil {
    readonly nome = 'recomendador-animacao';
    readonly descricao = 'Similaridade de cosseno com perfis que priorizam modelagem e animação 3D';

    constructor(config: Partial<Omit<ConfigSimilaridadeCosseno, 'perfis'>> = {}) {
        super(
            {
                [Papel.DIRETOR]: { direcao: 10, animacao3d: 8, roteiro: 5 },
                [Papel.EFEITOS_VISUAIS]: { animacao3d: 10, efeitos: 8, colorizacao: 4 },
                [Papel.EDITOR]: { montagem: 10, efeitos: 7, animacao3d: 5, colorizacao: 5 },
                [Papel.DIRETOR_FOTOGRAFIA]: { iluminacao: 10, animacao3d: 7, fotografia: 6 }
            },
            config
        );
    }
}
