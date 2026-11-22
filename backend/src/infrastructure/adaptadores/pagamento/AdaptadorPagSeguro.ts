import type { AdaptadorPagamento, StatusPagamento } from '../../../application/ports/AdaptadorPagamento.js';
import type { ApiPagSeguroSimulada } from '../../externos/ApiPagSeguroSimulada.js';

/** Código numérico do PagSeguro -> status do CineBridge. "0" = transação desconhecida. */
const STATUS: Readonly<Record<string, StatusPagamento>> = {
    '1': 'PENDENTE',
    '3': 'APROVADO',
    '6': 'CANCELADO',
    '7': 'RECUSADO'
};

/** Adapter: traduz o contrato padronizado para o GatewayPagamento (PagSeguro) do diagrama. */
export class AdaptadorPagSeguro implements AdaptadorPagamento {
    readonly provedor = 'pagseguro';
    private readonly gateway: ApiPagSeguroSimulada;

    constructor(gateway: ApiPagSeguroSimulada) {
        this.gateway = gateway;
    }

    public async efetuarPagamento(valor: number, origem: string, destino: string): Promise<string> {
        const transacao = await this.gateway.processarPagamento(valor, { comprador: origem, recebedor: destino });
        return transacao.codigo;
    }

    public async cancelarPagamento(id: string): Promise<boolean> {
        return this.gateway.estornarPagamento(id);
    }

    public async verificarPagamento(id: string): Promise<StatusPagamento> {
        const codigo = await this.gateway.consultarStatus(id);
        const status = STATUS[codigo];
        if (!status) throw new Error(`PagSeguro: transação ${id} desconhecida (status ${codigo})`);
        return status;
    }
}
