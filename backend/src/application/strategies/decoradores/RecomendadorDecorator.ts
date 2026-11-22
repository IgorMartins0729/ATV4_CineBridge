import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { RecomendacaoStrategy } from '../RecomendacaoStrategy.js';

/**
 * Decorator: implementa a mesma interface do recomendador e envolve outro (base ou já decorado).
 * O nome é o do recomendador envolvido, então a API, o histórico e a auditoria continuam mostrando
 * "similaridade-cosseno" (e não "cache"): para quem usa, o decorador é transparente.
 */
export abstract class RecomendadorDecorator implements RecomendacaoStrategy {
    protected readonly interno: RecomendacaoStrategy;

    constructor(interno: RecomendacaoStrategy) {
        this.interno = interno;
    }

    public get nome(): string {
        return this.interno.nome;
    }

    public get descricao(): string {
        return this.interno.descricao;
    }

    public abstract recomendar(projeto: Projeto, profissionais: readonly Profissional[]): Map<Papel, Profissional[]>;
}
