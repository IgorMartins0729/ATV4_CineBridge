import { randomUUID } from 'node:crypto';
import {
    gerarIdArquivo,
    type AdaptadorArmazenamento,
    type MetadadosArquivo
} from '../../../application/ports/AdaptadorArmazenamento.js';
import { NaoEncontradoError } from '../../../domain/erros.js';
import { ErroGoogleCloud, type ApiGoogleCloudStorageSimulada } from '../../externos/ApiGoogleCloudStorageSimulada.js';

/** Adapter: converte Buffer <-> File e traduz o erro 404 da nuvem para o erro de domínio. */
export class AdaptadorGoogleCloud implements AdaptadorArmazenamento {
    readonly provedor = 'google-cloud';
    private readonly storage: ApiGoogleCloudStorageSimulada;

    constructor(storage: ApiGoogleCloudStorageSimulada) {
        this.storage = storage;
    }

    public async salvarArquivo(conteudo: Buffer, metadados: MetadadosArquivo): Promise<string> {
        const caminho = gerarIdArquivo(metadados, randomUUID());
        const arquivo = new File([new Uint8Array(conteudo)], caminho, { type: metadados.tipo ?? 'application/octet-stream' });
        return this.storage.upload(arquivo);
    }

    public async recuperarArquivo(id: string): Promise<Buffer> {
        try {
            const arquivo = await this.storage.download(id);
            return Buffer.from(await arquivo.arrayBuffer());
        } catch (erro) {
            if (erro instanceof ErroGoogleCloud && erro.code === 404) throw new NaoEncontradoError(`Arquivo ${id} não encontrado`);
            throw erro;
        }
    }

    public async listarArquivos(prefixo: string): Promise<string[]> {
        return (await this.storage.listar(prefixo)).sort();
    }
}
