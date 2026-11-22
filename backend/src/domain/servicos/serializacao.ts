import type { Papel } from '../enums/Papel.js';
import { ValidacaoError } from '../erros.js';
import type { RequisitoPapel } from '../value-objects/RequisitoPapel.js';
import { PacoteServico } from './PacoteServico.js';
import { ServicoAtomico } from './ServicoAtomico.js';
import type { ServicoProjeto } from './ServicoProjeto.js';

/** Formato JSON da hierarquia de serviços (API e coluna JSONB do banco). */
export type ServicoJson =
    | { nome: string; papel: Papel; custo: number; prazo: number; peso: number }
    | { nome: string; paralelo: boolean; subservicos: ServicoJson[] };

// A árvore chega de fora (API): limita o tamanho para uma entrada maliciosa não estourar a pilha.
const PROFUNDIDADE_MAXIMA = 10;
const NOS_MAXIMOS = 500;

export function servicoParaJson(servico: ServicoProjeto): ServicoJson {
    if (servico instanceof ServicoAtomico) {
        return {
            nome: servico.nome,
            papel: servico.papel,
            custo: servico.calcularCusto(),
            prazo: servico.obterPrazo(),
            peso: servico.peso
        };
    }
    return {
        nome: servico.nome,
        paralelo: servico instanceof PacoteServico && servico.paralelo,
        subservicos: servico.listarSubservicos().map(servicoParaJson)
    };
}

/**
 * Monta a hierarquia a partir de JSON sem confiar no formato. Erros de formato viram ValidacaoError (HTTP 400).
 * As regras de negócio (papel válido, custo, prazo) ficam no `validar()` dos próprios serviços.
 */
export function servicoDeJson(dados: unknown): ServicoProjeto {
    const contador = { nos: 0 };
    return ler(dados, 1, contador);
}

function ler(dados: unknown, profundidade: number, contador: { nos: number }): ServicoProjeto {
    if (profundidade > PROFUNDIDADE_MAXIMA) {
        throw new ValidacaoError(`A hierarquia de serviços passa de ${PROFUNDIDADE_MAXIMA} níveis`);
    }
    if (++contador.nos > NOS_MAXIMOS) {
        throw new ValidacaoError(`A hierarquia de serviços passa de ${NOS_MAXIMOS} itens`);
    }
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
        throw new ValidacaoError('Cada serviço deve ser um objeto');
    }
    const item = dados as Record<string, unknown>;
    const nome = texto(item, 'nome');

    if (item['subservicos'] !== undefined) {
        const filhos = item['subservicos'];
        if (!Array.isArray(filhos)) throw new ValidacaoError(`"${nome}": "subservicos" deve ser uma lista`);
        const paralelo = item['paralelo'] ?? false;
        if (typeof paralelo !== 'boolean') throw new ValidacaoError(`"${nome}": "paralelo" deve ser true ou false`);
        return new PacoteServico({
            nome,
            paralelo,
            subservicos: filhos.map((filho) => ler(filho, profundidade + 1, contador))
        });
    }
    return new ServicoAtomico({
        nome,
        papel: texto(item, 'papel') as Papel,
        custo: numero(item, 'custo', nome),
        prazo: numero(item, 'prazo', nome),
        ...(item['peso'] !== undefined ? { peso: numero(item, 'peso', nome) } : {})
    });
}

function texto(item: Record<string, unknown>, campo: string): string {
    const valor = item[campo];
    if (typeof valor !== 'string') throw new ValidacaoError(`Serviço: "${campo}" deve ser um texto`);
    return valor;
}

function numero(item: Record<string, unknown>, campo: string, nome: string): number {
    const valor = item[campo];
    if (typeof valor !== 'number') throw new ValidacaoError(`"${nome}": "${campo}" deve ser um número`);
    return valor;
}

/**
 * Converte a lista simples de papéis (formato da ATV I/II) em um pacote de serviços atômicos.
 * Custo e prazo ficam em 0 ("não estimado"): a lista antiga não tinha essa informação.
 */
export function pacoteDePapeis(requisitos: readonly RequisitoPapel[], nome = 'Serviços do projeto'): PacoteServico {
    return new PacoteServico({
        nome,
        paralelo: true,
        subservicos: requisitos.map(
            (r) => new ServicoAtomico({ nome: r.getPapel(), papel: r.getPapel(), custo: 0, prazo: 0, peso: r.getPeso() })
        )
    });
}
