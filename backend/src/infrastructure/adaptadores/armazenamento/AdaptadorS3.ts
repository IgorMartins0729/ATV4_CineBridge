import { randomUUID } from 'node:crypto';
import {
    gerarIdArquivo,
    type AdaptadorArmazenamento,
    type MetadadosArquivo
} from '../../../application/ports/AdaptadorArmazenamento.js';
import { NaoEncontradoError } from '../../../domain/erros.js';
import { ErroS3, type ApiS3Simulada } from '../../externos/ApiS3Simulada.js';

/** Adapter: traduz o contrato do CineBridge para a API do S3 (bucket + chave, Uint8Array, listagem paginada). */
export class AdaptadorS3 implements AdaptadorArmazenamento {
    readonly provedor = 's3';
    private readonly s3: ApiS3Simulada;
    private readonly bucket: string;

    constructor(s3: ApiS3Simulada, bucket: string) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    public async salvarArquivo(conteudo: Buffer, metadados: MetadadosArquivo): Promise<string> {
        const chave = gerarIdArquivo(metadados, randomUUID());
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: chave,
            Body: conteudo,
            ...(metadados.tipo ? { ContentType: metadados.tipo } : {}),
            Metadata: { nome: metadados.nome }
        });
        return chave;
    }

    public async recuperarArquivo(id: string): Promise<Buffer> {
        try {
            const objeto = await this.s3.getObject({ Bucket: this.bucket, Key: id });
            return Buffer.from(objeto.Body);
        } catch (erro) {
            if (erro instanceof ErroS3 && erro.name === 'NoSuchKey') throw new NaoEncontradoError(`Arquivo ${id} não encontrado`);
            throw erro;
        }
    }

    /** O S3 devolve no máximo uma página por chamada: segue o ContinuationToken até o fim. */
    public async listarArquivos(prefixo: string): Promise<string[]> {
        const chaves: string[] = [];
        let token: string | undefined;
        do {
            const pagina = await this.s3.listObjectsV2({
                Bucket: this.bucket,
                Prefix: prefixo,
                ...(token ? { ContinuationToken: token } : {})
            });
            chaves.push(...pagina.Contents.map((c) => c.Key));
            token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
        } while (token);
        return chaves;
    }
}
