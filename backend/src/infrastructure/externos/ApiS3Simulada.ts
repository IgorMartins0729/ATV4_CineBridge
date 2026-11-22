import { createHash } from 'node:crypto';

/** Erro no formato do SDK da AWS (o `name` identifica o tipo, como em `NoSuchKey`). */
export class ErroS3 extends Error {
    constructor(
        public override readonly name: 'NoSuchKey',
        mensagem: string
    ) {
        super(mensagem);
    }
}

interface ObjetoS3 {
    Body: Uint8Array;
    ContentType?: string;
    Metadata: Record<string, string>;
}

/**
 * Simula a API do Amazon S3 (estilo do SDK v3): buckets, objetos com chave, `listObjectsV2` paginado
 * por `ContinuationToken`. Só imita o comportamento; nada sai da memória.
 */
export class ApiS3Simulada {
    private readonly buckets = new Map<string, Map<string, ObjetoS3>>();
    private readonly tamanhoPagina: number;

    /** @param tamanhoPagina itens por página no listObjectsV2 (o S3 real usa até 1000). */
    constructor(tamanhoPagina = 1000) {
        this.tamanhoPagina = tamanhoPagina;
    }

    public async putObject(params: {
        Bucket: string;
        Key: string;
        Body: Uint8Array;
        ContentType?: string;
        Metadata?: Record<string, string>;
    }): Promise<{ ETag: string }> {
        const bucket = this.buckets.get(params.Bucket) ?? new Map<string, ObjetoS3>();
        this.buckets.set(params.Bucket, bucket);
        bucket.set(params.Key, {
            Body: new Uint8Array(params.Body),
            ...(params.ContentType ? { ContentType: params.ContentType } : {}),
            Metadata: { ...params.Metadata }
        });
        return { ETag: `"${createHash('md5').update(params.Body).digest('hex')}"` };
    }

    public async getObject(params: {
        Bucket: string;
        Key: string;
    }): Promise<{ Body: Uint8Array; ContentType?: string; Metadata: Record<string, string> }> {
        const objeto = this.buckets.get(params.Bucket)?.get(params.Key);
        if (!objeto) throw new ErroS3('NoSuchKey', `The specified key does not exist: ${params.Key}`);
        return { ...objeto, Body: new Uint8Array(objeto.Body) };
    }

    public async listObjectsV2(params: { Bucket: string; Prefix?: string; ContinuationToken?: string }): Promise<{
        Contents: Array<{ Key: string; Size: number }>;
        IsTruncated: boolean;
        NextContinuationToken?: string;
    }> {
        const chaves = [...(this.buckets.get(params.Bucket)?.keys() ?? [])]
            .filter((chave) => chave.startsWith(params.Prefix ?? ''))
            .sort();
        const inicio = params.ContinuationToken ? Number(params.ContinuationToken) : 0;
        const pagina = chaves.slice(inicio, inicio + this.tamanhoPagina);
        const proximo = inicio + pagina.length;
        const bucket = this.buckets.get(params.Bucket);
        return {
            Contents: pagina.map((Key) => ({ Key, Size: bucket?.get(Key)?.Body.length ?? 0 })),
            IsTruncated: proximo < chaves.length,
            ...(proximo < chaves.length ? { NextContinuationToken: String(proximo) } : {})
        };
    }
}
