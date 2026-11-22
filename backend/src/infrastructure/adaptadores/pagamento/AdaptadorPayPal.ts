import type { AdaptadorPagamento, StatusPagamento } from '../../../application/ports/AdaptadorPagamento.js';
import type { ApiPayPalSimulada } from '../../externos/ApiPayPalSimulada.js';

/**
 * Adapter: no PayPal o pagamento é "criar pedido + capturar", o valor é texto ("1500.00")
 * e o estorno é feito sobre a captura, não sobre o pedido. O contrato padronizado esconde tudo isso.
 */
export class AdaptadorPayPal implements AdaptadorPagamento {
    readonly provedor = 'paypal';
    private readonly paypal: ApiPayPalSimulada;

    constructor(paypal: ApiPayPalSimulada) {
        this.paypal = paypal;
    }

    public async efetuarPagamento(valor: number, origem: string, destino: string): Promise<string> {
        const pedido = await this.paypal.createOrder({
            intent: 'CAPTURE',
            payer_id: origem,
            purchase_units: [{ amount: { currency_code: 'BRL', value: valor.toFixed(2) }, payee: { merchant_id: destino } }]
        });
        await this.paypal.captureOrder(pedido.id);
        return pedido.id;
    }

    public async cancelarPagamento(id: string): Promise<boolean> {
        const pedido = await this.paypal.getOrder(id);
        if (!pedido.captureId) return false;
        return (await this.paypal.refundCapture(pedido.captureId)).status === 'COMPLETED';
    }

    public async verificarPagamento(id: string): Promise<StatusPagamento> {
        const pedido = await this.paypal.getOrder(id);
        if (pedido.refunded || pedido.status === 'VOIDED') return 'CANCELADO';
        return pedido.status === 'COMPLETED' ? 'APROVADO' : 'PENDENTE';
    }
}
