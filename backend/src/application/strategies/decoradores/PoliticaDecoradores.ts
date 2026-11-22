import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ValidacaoError } from '../../../domain/erros.js';
import type { RecomendacaoStrategy } from '../RecomendacaoStrategy.js';

export const CAMADAS = ['cache', 'auditoria', 'compressao'] as const;
export type Camada = (typeof CAMADAS)[number];

/** Cria o decorador de uma camada em volta do recomendador recebido. */
export type CriadoresCamada = Readonly<Record<Camada, (interno: RecomendacaoStrategy) => RecomendacaoStrategy>>;

export interface ConfigDecoradores {
    /** Pilha usada quando o produtor não tem preferência. A ordem é a de aplicação: a primeira fica mais perto do recomendador base. */
    padrao: Camada[];
    /** Preferências por produtor (id do produtor -> pilha). */
    porProdutor: Record<string, Camada[]>;
}

/** Valida uma pilha vinda de configuração ou da API (camada desconhecida ou repetida = erro). */
export function validarPilha(camadas: readonly string[]): Camada[] {
    const desconhecidas = camadas.filter((c) => !(CAMADAS as readonly string[]).includes(c));
    if (desconhecidas.length > 0) {
        throw new ValidacaoError(`Decorador desconhecido: ${desconhecidas.join(', ')}. Opções: ${CAMADAS.join(', ')}`);
    }
    if (new Set(camadas).size !== camadas.length) {
        throw new ValidacaoError('Um decorador não pode aparecer duas vezes na pilha');
    }
    return [...camadas] as Camada[];
}

/**
 * Aplica as camadas na ordem dada: `['cache', 'auditoria', 'compressao']` vira
 * Compressao(Auditoria(Cache(base))). Assim a auditoria enxerga também os acertos de cache,
 * e a compressão atua sobre a saída final.
 */
export function decorar(
    base: RecomendacaoStrategy,
    camadas: readonly Camada[],
    criadores: CriadoresCamada
): RecomendacaoStrategy {
    return camadas.reduce((interno, camada) => criadores[camada](interno), base);
}

/**
 * Decide, em tempo de execução, a pilha de decoradores de cada recomendação
 * (configuração do sistema ou preferência do produtor do projeto).
 *
 * Os recomendadores decorados são reaproveitados entre as requisições (por estratégia + pilha):
 * sem isso, cada requisição teria um cache novo e vazio.
 */
export class PoliticaDecoradores {
    private readonly padrao: Camada[];
    private readonly porProdutor = new Map<string, Camada[]>();
    private readonly criadores: CriadoresCamada;
    // Por instância (não por nome): uma estratégia trocada com outra configuração ganha a sua própria pilha.
    private readonly montados = new WeakMap<RecomendacaoStrategy, Map<string, RecomendacaoStrategy>>();

    constructor(config: ConfigDecoradores, criadores: CriadoresCamada) {
        this.padrao = validarPilha(config.padrao);
        for (const [produtor, camadas] of Object.entries(config.porProdutor)) {
            this.porProdutor.set(produtor, validarPilha(camadas));
        }
        this.criadores = criadores;
    }

    public pilhaPara(projeto: Projeto): readonly Camada[] {
        return this.porProdutor.get(projeto.getProdutor().id) ?? this.padrao;
    }

    public definirPreferencia(produtorId: string, camadas: readonly string[]): Camada[] {
        const pilha = validarPilha(camadas);
        this.porProdutor.set(produtorId, pilha);
        return pilha;
    }

    public aplicar(estrategia: RecomendacaoStrategy, projeto: Projeto): RecomendacaoStrategy {
        const pilha = this.pilhaPara(projeto);
        if (pilha.length === 0) return estrategia;
        const chave = pilha.join('>');
        let porPilha = this.montados.get(estrategia);
        if (!porPilha) {
            porPilha = new Map();
            this.montados.set(estrategia, porPilha);
        }
        let decorada = porPilha.get(chave);
        if (!decorada) {
            decorada = decorar(estrategia, pilha, this.criadores);
            porPilha.set(chave, decorada);
        }
        return decorada;
    }
}
