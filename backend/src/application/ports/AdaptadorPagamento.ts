/** Situação de um pagamento no vocabulário do CineBridge (cada gateway usa o seu, e o adaptador traduz). */
export type StatusPagamento = 'APROVADO' | 'PENDENTE' | 'RECUSADO' | 'CANCELADO';

/**
 * Adapter (alvo): contrato padronizado dos gateways de pagamento (Stripe, PagSeguro, PayPal).
 * Valores sempre em reais; quem precisa de centavos ou texto é o adaptador.
 */
export interface AdaptadorPagamento {
    readonly provedor: string;

    /** Cobra `valor` de `origem` (produtor) para `destino` (profissional). Devolve o id da transação. */
    efetuarPagamento(valor: number, origem: string, destino: string): Promise<string>;

    /** Estorna. false se o gateway recusar (ex.: já estornado). */
    cancelarPagamento(id: string): Promise<boolean>;

    verificarPagamento(id: string): Promise<StatusPagamento>;
}
