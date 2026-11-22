import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    gerarIdArquivo,
    type AdaptadorArmazenamento,
    type MetadadosArquivo
} from '../../../application/ports/AdaptadorArmazenamento.js';
import { NaoEncontradoError, ValidacaoError } from '../../../domain/erros.js';

/**
 * Adapter para o sistema de arquivos local (o "sistema externo" aqui é o próprio disco).
 * O id usa "/" em qualquer sistema; `path` converte para o separador do Windows ou do Linux.
 * Os metadados (tipo do conteúdo) não são guardados: o disco só guarda o conteúdo.
 */
export class AdaptadorLocal implements AdaptadorArmazenamento {
    readonly provedor = 'local';
    private readonly raiz: string;

    constructor(diretorio: string) {
        this.raiz = path.resolve(diretorio);
    }

    public async salvarArquivo(conteudo: Buffer, metadados: MetadadosArquivo): Promise<string> {
        const id = gerarIdArquivo(metadados, randomUUID());
        const destino = this.caminho(id);
        await mkdir(path.dirname(destino), { recursive: true });
        await writeFile(destino, conteudo);
        return id;
    }

    public async recuperarArquivo(id: string): Promise<Buffer> {
        try {
            return await readFile(this.caminho(id));
        } catch (erro) {
            if ((erro as NodeJS.ErrnoException).code === 'ENOENT') throw new NaoEncontradoError(`Arquivo ${id} não encontrado`);
            throw erro;
        }
    }

    public async listarArquivos(prefixo: string): Promise<string[]> {
        let entradas: string[];
        try {
            entradas = await readdir(this.raiz, { recursive: true });
        } catch (erro) {
            if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw erro;
        }
        const ids = entradas.map((e) => e.split(path.sep).join('/')).filter((id) => id.startsWith(prefixo));
        // readdir recursivo também devolve as pastas: fica só com o que é arquivo gerado por salvarArquivo.
        return ids.filter((id) => /\/?[0-9a-f-]{36}-[^/]+$/.test(id)).sort();
    }

    /** Impede que um id como "../../etc/passwd" leia fora da pasta configurada. */
    private caminho(id: string): string {
        const destino = path.resolve(this.raiz, ...id.split('/'));
        if (!destino.startsWith(this.raiz + path.sep)) {
            throw new ValidacaoError(`Id de arquivo inválido: ${id}`);
        }
        return destino;
    }
}
