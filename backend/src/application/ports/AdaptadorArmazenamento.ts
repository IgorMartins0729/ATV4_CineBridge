import { ValidacaoError } from '../../domain/erros.js';

/** Dados do arquivo. `pasta` agrupa os arquivos (ex.: "projetos/<id>"); o id gerado começa por ela. */
export interface MetadadosArquivo {
    nome: string;
    /** Tipo do conteúdo (ex.: "application/pdf"). */
    tipo?: string;
    pasta?: string;
}

/**
 * Adapter (alvo): contrato padronizado de armazenamento de arquivos de mídia (roteiros, storyboards, amostras).
 * O núcleo só conhece esta interface; cada provedor (S3, Google Cloud, disco local) tem o seu adaptador.
 *
 * Assíncrono, ao contrário do diagrama: toda chamada a um serviço externo é de rede/disco em Node.js.
 */
export interface AdaptadorArmazenamento {
    readonly provedor: string;

    /** Grava e devolve o id do arquivo. */
    salvarArquivo(conteudo: Buffer, metadados: MetadadosArquivo): Promise<string>;

    /** Lança NaoEncontradoError se o arquivo não existir. */
    recuperarArquivo(id: string): Promise<Buffer>;

    /** Ids dos arquivos que começam pelo prefixo, em ordem alfabética. */
    listarArquivos(prefixo: string): Promise<string[]>;
}

const SEGMENTO_INVALIDO = /[^\w.-]/g;

/**
 * Id padronizado "pasta/uuid-nome", usado pelos adaptadores. Limpa nome e pasta para que um valor vindo de fora
 * não escape da pasta (ex.: "../../etc") em provedores baseados em caminho, como o disco local.
 */
export function gerarIdArquivo(metadados: MetadadosArquivo, uuid: string): string {
    const nome = metadados.nome.trim().replace(SEGMENTO_INVALIDO, '_');
    if (!nome || nome === '.' || nome === '..') {
        throw new ValidacaoError('Nome de arquivo inválido');
    }
    const pasta = (metadados.pasta ?? '').split('/').filter(Boolean);
    if (pasta.some((segmento) => segmento === '.' || segmento === '..')) {
        throw new ValidacaoError('Pasta de arquivo inválida');
    }
    return [...pasta.map((s) => s.replace(SEGMENTO_INVALIDO, '_')), `${uuid}-${nome}`].join('/');
}
