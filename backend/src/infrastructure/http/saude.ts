import type { FastifyReply } from 'fastify';

/** Uma função por dependência (banco, RabbitMQ...): resolve se está acessível, lança erro se não está. */
export type Verificacoes = Record<string, () => Promise<unknown>>;

/**
 * GET /health usado pelo healthcheck do Docker Compose: 200 só quando o serviço consegue atender,
 * isto é, quando todas as dependências respondem; 503 com o motivo caso contrário.
 */
export async function responderSaude(
    resposta: FastifyReply,
    verificacoes: Verificacoes,
    extras?: () => Promise<Record<string, unknown>>
): Promise<FastifyReply> {
    const dependencias: Record<string, string> = {};
    await Promise.all(
        Object.entries(verificacoes).map(async ([nome, verificar]) => {
            try {
                await verificar();
                dependencias[nome] = 'ok';
            } catch (erro) {
                dependencias[nome] = erro instanceof Error ? erro.message : String(erro);
            }
        })
    );
    const ok = Object.values(dependencias).every((estado) => estado === 'ok');
    return resposta
        .status(ok ? 200 : 503)
        .send({ status: ok ? 'ok' : 'indisponivel', dependencias, ...(ok && extras ? await extras() : {}) });
}
