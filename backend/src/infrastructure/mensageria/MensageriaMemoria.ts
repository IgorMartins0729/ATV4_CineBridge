import type { IMensageria, Pedido } from '../../application/ports/IMensageria.js';
import { abrirResposta, respostaDeErro, type Resposta } from './protocolo.js';

/** Simula o tráfego pela rede: só passa o que sobrevive a JSON (datas viram texto, classes viram objetos). */
const pelaRede = <T>(valor: T): T => (valor === undefined ? valor : JSON.parse(JSON.stringify(valor)));

/**
 * Broker em memória com a mesma semântica do RabbitMQ usada aqui: filas ponto a ponto,
 * ack só depois de tratar, RPC com erro relançado no chamador. Usado nos testes de integração
 * que sobem os quatro serviços no mesmo processo.
 */
export class MensageriaMemoria implements IMensageria {
    private readonly consumidores = new Map<string, (mensagem: unknown) => Promise<void>>();
    private readonly servidores = new Map<string, (pedido: Pedido) => Promise<unknown>>();
    /** Mensagens publicadas sem consumidor ficam guardadas, como numa fila durável. */
    private readonly pendentes = new Map<string, unknown[]>();
    private aberta = true;

    public async publicar(fila: string, mensagem: unknown): Promise<void> {
        const consumidor = this.consumidores.get(fila);
        if (!consumidor) {
            this.pendentes.set(fila, [...(this.pendentes.get(fila) ?? []), pelaRede(mensagem)]);
            return;
        }
        // Como no broker real, quem publica não fica sabendo se o consumidor falhou (só que a mensagem foi aceita).
        this.falhas.push(...(await consumidor(pelaRede(mensagem)).then(() => [], (erro: unknown) => [erro])));
    }

    /** Erros dos consumidores (no RabbitMQ iriam para o log e a mensagem voltaria para a fila). */
    public readonly falhas: unknown[] = [];

    public async consumir(fila: string, tratar: (mensagem: unknown) => Promise<void>): Promise<void> {
        this.consumidores.set(fila, tratar);
        const guardadas = this.pendentes.get(fila) ?? [];
        this.pendentes.delete(fila);
        for (const mensagem of guardadas) await tratar(mensagem);
    }

    public async requisitar<R>(fila: string, pedido: Pedido): Promise<R> {
        const servidor = this.servidores.get(fila);
        if (!servidor) throw new Error(`Ninguém responde na fila ${fila}`);
        let resposta: Resposta;
        try {
            resposta = { ok: true, valor: await servidor(pelaRede(pedido)) };
        } catch (erro) {
            resposta = respostaDeErro(erro);
        }
        return abrirResposta<R>(pelaRede(resposta));
    }

    public async responder(fila: string, tratar: (pedido: Pedido) => Promise<unknown>): Promise<void> {
        this.servidores.set(fila, tratar);
    }

    public async verificar(): Promise<void> {
        if (!this.aberta) throw new Error('Mensageria encerrada');
    }

    public async encerrar(): Promise<void> {
        this.aberta = false;
    }
}
