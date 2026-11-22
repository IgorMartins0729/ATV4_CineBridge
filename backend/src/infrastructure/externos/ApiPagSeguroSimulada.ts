import { randomUUID } from 'node:crypto';

/** Códigos de status de transação do PagSeguro: 1 aguardando, 3 paga, 6 devolvida, 7 cancelada. */
export type CodigoStatusPagSeguro = 1 | 3 | 6 | 7;

/** Transação do gateway (o diagrama cita `Transacao` sem defini-la). */
export interface Transacao {
    codigo: string;
    /** Em reais. */
    valor: number;
    status: CodigoStatusPagSeguro;
    comprador: string;
    recebedor: string;
}

/**
 * Simula o gateway PagSeguro. As assinaturas são as do `GatewayPagamento` do diagrama:
 * valor em reais, dados livres, status como código numérico em texto.
 */
export class ApiPagSeguroSimulada {
    private readonly transacoes = new Map<string, Transacao>();

    public async processarPagamento(valor: number, dados: { comprador: string; recebedor: string }): Promise<Transacao> {
        const transacao: Transacao = {
            codigo: randomUUID().toUpperCase(),
            valor,
            status: valor > 0 ? 3 : 7,
            comprador: dados.comprador,
            recebedor: dados.recebedor
        };
        this.transacoes.set(transacao.codigo, transacao);
        return { ...transacao };
    }

    /** Devolve o valor ao comprador. false se a transação não existe ou não está paga. */
    public async estornarPagamento(id: string): Promise<boolean> {
        const transacao = this.transacoes.get(id);
        if (!transacao || transacao.status !== 3) return false;
        transacao.status = 6;
        return true;
    }

    /** Código do status em texto ("3" = paga). Transação inexistente devolve "0". */
    public async consultarStatus(id: string): Promise<string> {
        return String(this.transacoes.get(id)?.status ?? 0);
    }
}
