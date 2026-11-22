import type { Projeto, ProjetoProps } from '../../domain/entities/Projeto.js';
import type { TipoProjeto } from '../../domain/enums/TipoProjeto.js';
import { ValidacaoError } from '../../domain/erros.js';

/** Modelo pré-configurado, como é exibido para o produtor. */
export interface ModeloProjeto {
    nome: string;
    descricao: string;
    tipoProjeto: TipoProjeto;
    /** Clone do protótipo: pode ser lido à vontade sem afetar o registro. */
    prototipo: Projeto;
}

/**
 * Registro de protótipos: guarda modelos de projeto por nome e entrega sempre um clone,
 * de modo que quem usa o modelo nunca altera o original.
 */
export class RegistroPrototipos {
    private readonly prototipos = new Map<string, { descricao: string; prototipo: Projeto }>();

    public registrar(nome: string, prototipo: Projeto, descricao = ''): void {
        this.prototipos.set(nome, { descricao, prototipo: prototipo.clonar() });
    }

    public clonar(nome: string, ajustes: Partial<ProjetoProps> = {}): Projeto {
        const registro = this.prototipos.get(nome);
        if (!registro) {
            throw new ValidacaoError(`Modelo de projeto "${nome}" não encontrado. Opções: ${this.nomes().join(', ')}`);
        }
        return registro.prototipo.clonar(ajustes);
    }

    public existe(nome: string): boolean {
        return this.prototipos.has(nome);
    }

    /** Tipo de projeto do modelo (lança ValidacaoError se o modelo não existir). */
    public tipoDe(nome: string): TipoProjeto {
        return this.clonar(nome).getTipo();
    }

    public nomes(): string[] {
        return [...this.prototipos.keys()];
    }

    public listar(tipo?: TipoProjeto): ModeloProjeto[] {
        return [...this.prototipos]
            .map(([nome, { descricao, prototipo }]) => ({
                nome,
                descricao,
                tipoProjeto: prototipo.getTipo(),
                prototipo: prototipo.clonar()
            }))
            .filter((modelo) => tipo === undefined || modelo.tipoProjeto === tipo);
    }
}
