/** Erro HTTP no formato da biblioteca do Google Cloud (`code` numérico). */
export class ErroGoogleCloud extends Error {
    constructor(
        public readonly code: number,
        mensagem: string
    ) {
        super(mensagem);
    }
}

/**
 * Simula um storage em nuvem no estilo Google Cloud Storage. As assinaturas são as do
 * `ArmazenamentoExterno` do diagrama: trabalha com objetos `File` (nome + conteúdo + tipo), não com Buffer.
 */
export class ApiGoogleCloudStorageSimulada {
    private readonly arquivos = new Map<string, File>();

    /** Grava o arquivo usando o nome dele como caminho do objeto e devolve esse caminho. */
    public async upload(arquivo: File): Promise<string> {
        this.arquivos.set(arquivo.name, arquivo);
        return arquivo.name;
    }

    public async download(id: string): Promise<File> {
        const arquivo = this.arquivos.get(id);
        if (!arquivo) throw new ErroGoogleCloud(404, `No such object: ${id}`);
        return arquivo;
    }

    /** Caminhos dos objetos dentro da "pasta" (prefixo). */
    public async listar(pasta: string): Promise<string[]> {
        return [...this.arquivos.keys()].filter((nome) => nome.startsWith(pasta));
    }
}
