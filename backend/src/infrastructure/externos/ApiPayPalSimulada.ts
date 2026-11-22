import { randomUUID } from 'node:crypto';

export interface PedidoPayPal {
    id: string;
    status: 'CREATED' | 'COMPLETED' | 'VOIDED';
    purchase_units: Array<{ amount: { currency_code: string; value: string }; payee: { merchant_id: string } }>;
    payer_id: string;
    captureId?: string;
    refunded: boolean;
}

/**
 * Simula a API de Orders do PayPal: o pagamento é feito em dois passos (criar o pedido e capturar),
 * e o valor viaja como texto com duas casas decimais ("1500.00").
 */
export class ApiPayPalSimulada {
    private readonly pedidos = new Map<string, PedidoPayPal>();

    public async createOrder(params: {
        intent: 'CAPTURE';
        payer_id: string;
        purchase_units: PedidoPayPal['purchase_units'];
    }): Promise<{ id: string; status: 'CREATED' }> {
        const valor = params.purchase_units[0]?.amount.value ?? '';
        if (!/^\d+\.\d{2}$/.test(valor) || Number(valor) <= 0) {
            throw new Error(`INVALID_PARAMETER_VALUE: amount.value "${valor}"`);
        }
        const pedido: PedidoPayPal = {
            id: randomUUID().slice(0, 17).toUpperCase(),
            status: 'CREATED',
            purchase_units: params.purchase_units,
            payer_id: params.payer_id,
            refunded: false
        };
        this.pedidos.set(pedido.id, pedido);
        return { id: pedido.id, status: 'CREATED' };
    }

    public async captureOrder(id: string): Promise<{ id: string; status: 'COMPLETED'; captureId: string }> {
        const pedido = this.obter(id);
        pedido.status = 'COMPLETED';
        pedido.captureId = `CAP-${randomUUID().slice(0, 8)}`;
        return { id, status: 'COMPLETED', captureId: pedido.captureId };
    }

    public async refundCapture(captureId: string): Promise<{ status: 'COMPLETED' | 'FAILED' }> {
        const pedido = [...this.pedidos.values()].find((p) => p.captureId === captureId);
        if (!pedido || pedido.refunded) return { status: 'FAILED' };
        pedido.refunded = true;
        return { status: 'COMPLETED' };
    }

    public async getOrder(id: string): Promise<PedidoPayPal> {
        return { ...this.obter(id) };
    }

    private obter(id: string): PedidoPayPal {
        const pedido = this.pedidos.get(id);
        if (!pedido) throw new Error(`RESOURCE_NOT_FOUND: order ${id}`);
        return pedido;
    }
}
