import { randomUUID } from 'node:crypto';

export class ErroStripe extends Error {
    constructor(
        public readonly code: string,
        mensagem: string
    ) {
        super(mensagem);
    }
}

export type StatusIntentStripe = 'succeeded' | 'processing' | 'requires_payment_method' | 'canceled';

export interface PaymentIntent {
    id: string;
    /** Em centavos, sempre inteiro (como na API real da Stripe). */
    amount: number;
    currency: string;
    customer: string;
    transfer_data: { destination: string };
    status: StatusIntentStripe;
    /** A Stripe marca o estorno na cobrança, não muda o status do PaymentIntent. */
    amount_refunded: number;
}

/**
 * Simula a API da Stripe: PaymentIntents em centavos e estornos (refunds) como objeto separado.
 * `limiteCartao` (em centavos) faz o cartão recusar cobranças maiores, para testar a recusa.
 */
export class ApiStripeSimulada {
    private readonly intents = new Map<string, PaymentIntent>();
    private readonly limiteCartao: number;

    constructor(limiteCartao = Number.POSITIVE_INFINITY) {
        this.limiteCartao = limiteCartao;
    }

    public readonly paymentIntents = {
        create: async (params: {
            amount: number;
            currency: string;
            customer: string;
            transfer_data: { destination: string };
            confirm: boolean;
        }): Promise<PaymentIntent> => {
            if (!Number.isInteger(params.amount) || params.amount <= 0) {
                throw new ErroStripe('parameter_invalid_integer', 'amount must be a positive integer (cents)');
            }
            const intent: PaymentIntent = {
                id: `pi_${randomUUID().replaceAll('-', '')}`,
                amount: params.amount,
                currency: params.currency,
                customer: params.customer,
                transfer_data: { ...params.transfer_data },
                status: !params.confirm ? 'processing' : params.amount > this.limiteCartao ? 'requires_payment_method' : 'succeeded',
                amount_refunded: 0
            };
            this.intents.set(intent.id, intent);
            return { ...intent };
        },
        retrieve: async (id: string): Promise<PaymentIntent> => {
            const intent = this.intents.get(id);
            if (!intent) throw new ErroStripe('resource_missing', `No such payment_intent: '${id}'`);
            return { ...intent };
        }
    };

    public readonly refunds = {
        create: async (params: { payment_intent: string }): Promise<{ id: string; status: 'succeeded' }> => {
            const intent = this.intents.get(params.payment_intent);
            if (!intent) throw new ErroStripe('resource_missing', `No such payment_intent: '${params.payment_intent}'`);
            if (intent.status !== 'succeeded') throw new ErroStripe('charge_not_captured', 'Nothing to refund');
            if (intent.amount_refunded > 0) throw new ErroStripe('charge_already_refunded', 'Charge already refunded');
            intent.amount_refunded = intent.amount;
            return { id: `re_${randomUUID().replaceAll('-', '')}`, status: 'succeeded' };
        }
    };
}
