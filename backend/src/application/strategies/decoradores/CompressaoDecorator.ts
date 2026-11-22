import { gunzipSync, gzipSync } from 'node:zlib';
import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import { RecomendacoesPorPapel } from '../../../domain/entities/Recomendacao.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { RecomendacaoStrategy } from '../RecomendacaoStrategy.js';
import { RecomendadorDecorator } from './RecomendadorDecorator.js';

/** Formato de transmissão do resultado (o que vai pela rede para outro serviço). */
export type ResultadoTransmitido = Partial<
    Record<Papel, Array<{ id: string; nome: string; precoMedio: number; pontuacao: number }>>
>;

export interface PacoteRecomendacao {
    dados: Buffer;
    /** false quando o gzip não reduziria o tamanho (resultados muito pequenos): os dados vão em JSON puro. */
    comprimido: boolean;
    tamanhoOriginal: number;
    tamanhoTransmitido: number;
}

/**
 * Decorator: comprime os dados de saída para reduzir o tráfego de rede.
 *
 * A interface RecomendacaoStrategy não pode mudar (exigência do enunciado), então `recomendar` continua
 * devolvendo o Map. O pacote comprimido (o que de fato trafega) é entregue ao `destino` e fica em
 * `ultimoPacote()`; `descomprimir` faz o caminho de volta no serviço que recebe.
 */
export class CompressaoDecorator extends RecomendadorDecorator {
    private readonly destino: ((pacote: PacoteRecomendacao, projeto: Projeto) => void) | null;
    private ultimo: PacoteRecomendacao | null = null;
    private bytesOriginais = 0;
    private bytesTransmitidos = 0;

    constructor(interno: RecomendacaoStrategy, destino?: (pacote: PacoteRecomendacao, projeto: Projeto) => void) {
        super(interno);
        this.destino = destino ?? null;
    }

    public recomendar(projeto: Projeto, profissionais: readonly Profissional[]): Map<Papel, Profissional[]> {
        const resultado = this.interno.recomendar(projeto, profissionais);
        const pacote = CompressaoDecorator.comprimir(resultado);
        this.ultimo = pacote;
        this.bytesOriginais += pacote.tamanhoOriginal;
        this.bytesTransmitidos += pacote.tamanhoTransmitido;
        this.destino?.(pacote, projeto);
        return resultado;
    }

    public ultimoPacote(): PacoteRecomendacao | null {
        return this.ultimo;
    }

    public estatisticas(): { bytesOriginais: number; bytesTransmitidos: number } {
        return { bytesOriginais: this.bytesOriginais, bytesTransmitidos: this.bytesTransmitidos };
    }

    public static comprimir(resultado: Map<Papel, Profissional[]>): PacoteRecomendacao {
        const pontuadas = RecomendacoesPorPapel.de(resultado);
        const transmitido: ResultadoTransmitido = {};
        for (const [papel, lista] of resultado) {
            transmitido[papel] = lista.map((p) => ({
                id: p.getId(),
                nome: p.getNome(),
                precoMedio: p.getPrecoMedio(),
                pontuacao: pontuadas.pontuacao(papel, p)
            }));
        }
        const json = Buffer.from(JSON.stringify(transmitido), 'utf8');
        const gzip = gzipSync(json);
        const comprimido = gzip.length < json.length;
        const dados = comprimido ? gzip : json;
        return { dados, comprimido, tamanhoOriginal: json.length, tamanhoTransmitido: dados.length };
    }

    public static descomprimir(pacote: Pick<PacoteRecomendacao, 'dados' | 'comprimido'>): ResultadoTransmitido {
        const json = pacote.comprimido ? gunzipSync(pacote.dados) : pacote.dados;
        return JSON.parse(json.toString('utf8')) as ResultadoTransmitido;
    }
}
