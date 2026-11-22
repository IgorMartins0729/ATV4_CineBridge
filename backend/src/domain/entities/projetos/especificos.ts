import { ValidacaoError } from '../../erros.js';

/** Leitura defensiva dos atributos específicos que chegam da API ou do banco (formato livre). */

export function lerTexto(dados: Readonly<Record<string, unknown>>, campo: string): string | undefined {
    const valor = dados[campo];
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string') {
        throw new ValidacaoError(`"${campo}" deve ser um texto`);
    }
    return valor;
}

export function lerListaTexto(dados: Readonly<Record<string, unknown>>, campo: string): string[] | undefined {
    const valor = dados[campo];
    if (valor === undefined) return undefined;
    if (!Array.isArray(valor) || valor.some((item) => typeof item !== 'string')) {
        throw new ValidacaoError(`"${campo}" deve ser uma lista de textos`);
    }
    return [...(valor as string[])];
}

export function lerOpcao<T extends string>(
    dados: Readonly<Record<string, unknown>>,
    campo: string,
    opcoes: readonly T[]
): T | undefined {
    const valor = lerTexto(dados, campo);
    if (valor === undefined) return undefined;
    if (!opcoes.includes(valor as T)) {
        throw new ValidacaoError(`"${campo}" deve ser um destes valores: ${opcoes.join(', ')}`);
    }
    return valor as T;
}

/** Remove espaços e itens vazios de uma lista de textos. */
export function limparLista(lista: readonly string[]): string[] {
    return lista.map((item) => item.trim()).filter((item) => item.length > 0);
}
