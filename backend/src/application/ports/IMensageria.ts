/** Nomes das filas no RabbitMQ (cinebridge-mq). */
export const FILAS = {
    /** RPC: cinebridge-api pergunta, cinebridge-profissionais responde (nome dado pelo enunciado). */
    consultaProfissionais: 'consulta-profissionais',
    /** RPC: cinebridge-api grava e lê projetos e convites no cinebridge-projetos (o enunciado não dá nome). */
    comandosProjetos: 'comandos-projetos',
    /** Eventos de ciclo de vida publicados pelo cinebridge-projetos (nome dado pelo enunciado). */
    eventosProjetos: 'eventos-projetos',
    /** E-mails e mensagens internas que o cinebridge-api pede para o cinebridge-notificacoes enviar. */
    envioNotificacoes: 'envio-notificacoes',
    /** RPC: leitura da caixa de mensagens internas, que fica no cinebridge-notificacoes. */
    consultaNotificacoes: 'consulta-notificacoes'
} as const;

/** Pedido de RPC: qual operação executar e seus argumentos. */
export interface Pedido {
    operacao: string;
    args?: unknown;
}

/**
 * Comunicação assíncrona entre microsserviços. Implementada com amqplib (MensageriaAmqp)
 * e em memória para testes (MensageriaMemoria). Tudo o que passa por aqui precisa ser JSON.
 */
export interface IMensageria {
    /** Publica na fila (durável) e aguarda a confirmação do broker. */
    publicar(fila: string, mensagem: unknown): Promise<void>;

    /** Consome a fila. A mensagem só é confirmada (ack) depois que `tratar` termina sem erro. */
    consumir(fila: string, tratar: (mensagem: unknown) => Promise<void>): Promise<void>;

    /** RPC: publica o pedido e aguarda a resposta na fila de retorno. Erros do outro lado são relançados aqui. */
    requisitar<R>(fila: string, pedido: Pedido): Promise<R>;

    /** Lado servidor do RPC: o valor devolvido por `tratar` volta para quem pediu. */
    responder(fila: string, tratar: (pedido: Pedido) => Promise<unknown>): Promise<void>;

    /** Lança erro se a conexão com o broker não está aberta (usado pelo /health). */
    verificar(): Promise<void>;

    encerrar(): Promise<void>;
}
