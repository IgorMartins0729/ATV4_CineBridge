import type { AdaptadorPagamento, StatusPagamento } from '../../../application/ports/AdaptadorPagamento.js';
import { ErroStripe, type ApiStripeSimulada, type StatusIntentStripe } from '../../externos/ApiStripeSimulada.js';

const STATUS: Readonly<Record<StatusIntentStripe, StatusPagamento>> = {
    succeeded: 'APROVADO',
    processing: 'PENDENTE',
    requires_payment_method: 'RECUSADO',
    canceled: 'CANCELADO'
};

/** Adapter: reais -> centavos, PaymentIntent -> id, status e estorno da Stripe -> vocabulário do CineBridge. */
export class AdaptadorStripe implements AdaptadorPagamento {
    readonly provedor = 'stripe';
    private readonly stripe: ApiStripeSimulada;

    constructor(stripe: ApiStripeSimulada) {
        this.stripe = stripe;
    }

    public async efetuarPagamento(valor: number, origem: string, destino: string): Promise<string> {
        const intent = await this.stripe.paymentIntents.create({
            amount: Math.round(valor * 100),
            currency: 'brl',
            customer: origem,
            transfer_data: { destination: destino },
            confirm: true
        });
        return intent.id;
    }

    public async cancelarPagamento(id: string): Promise<boolean> {
        try {
            const reembolso = await this.stripe.refunds.create({ payment_intent: id });
            return reembolso.status === 'succeeded';
        } catch (erro) {
            if (erro instanceof ErroStripe) return false;
            throw erro;
        }
    }

    public async verificarPagamento(id: string): Promise<StatusPagamento> {
        const intent = await this.stripe.paymentIntents.retrieve(id);
        return intent.amount_refunded > 0 ? 'CANCELADO' : STATUS[intent.status];
    }
}
