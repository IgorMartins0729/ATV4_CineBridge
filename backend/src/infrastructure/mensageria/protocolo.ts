import {
    ConflitoError,
    ErroDominio,
    NaoEncontradoError,
    RestricaoInvalidaError,
    ValidacaoError
} from '../../domain/erros.js';

/** Resposta de RPC: o valor, ou o erro de domínio serializado (para a API devolver o mesmo status HTTP). */
export type Resposta = { ok: true; valor: unknown } | { ok: false; codigo: string; mensagem: string; problemas?: string[] };

export function respostaDeErro(erro: unknown): Resposta {
    if (erro instanceof ErroDominio) {
        return {
            ok: false,
            codigo: erro.codigo,
            mensagem: erro.message,
            ...(erro instanceof RestricaoInvalidaError ? { problemas: [...erro.getProblemas()] } : {})
        };
    }
    return { ok: false, codigo: 'ERRO_INTERNO', mensagem: erro instanceof Error ? erro.message : String(erro) };
}

const ERROS: Record<string, (mensagem: string) => Error> = {
    NAO_ENCONTRADO: (m) => new NaoEncontradoError(m),
    CONFLITO: (m) => new ConflitoError(m),
    VALIDACAO: (m) => new ValidacaoError(m)
};

/** Desfaz a Resposta: devolve o valor ou relança o erro com a mesma classe de domínio. */
export function abrirResposta<R>(resposta: Resposta): R {
    if (resposta.ok) return resposta.valor as R;
    if (resposta.codigo === 'RESTRICAO_INVALIDA') throw new RestricaoInvalidaError(resposta.problemas ?? [resposta.mensagem]);
    throw (ERROS[resposta.codigo] ?? ((m: string) => new Error(m)))(resposta.mensagem);
}
