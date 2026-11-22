import { EventoRecomendacao, type Evento } from '../../application/eventos/EventoRecomendacao.js';
import type { Observador } from '../../application/observers/Observador.js';
import type { ICaixaMensagens, IEnviadorEmail, MensagemEmail, MensagemInterna } from '../../application/ports/ICanaisNotificacao.js';
import { FILAS, type IMensageria } from '../../application/ports/IMensageria.js';
import { ValidacaoError } from '../../domain/erros.js';

type PedidoEnvio = ({ canal: 'EMAIL' } & MensagemEmail) | ({ canal: 'INTERNA' } & Omit<MensagemInterna, 'criadaEm'> & { criadaEm: string });

/**
 * Adapter do lado do cinebridge-api: os observadores (e-mail, mensagem interna, notificador de cada tipo de projeto)
 * continuam iguais; só o canal muda: em vez de enviar, publica na fila "envio-notificacoes".
 */
export class EnviadorEmailRemoto implements IEnviadorEmail {
    constructor(private readonly mensageria: IMensageria) {}

    public async enviar(mensagem: MensagemEmail): Promise<void> {
        await this.mensageria.publicar(FILAS.envioNotificacoes, { canal: 'EMAIL', ...mensagem });
    }
}

export class CaixaMensagensRemota implements ICaixaMensagens {
    constructor(private readonly mensageria: IMensageria) {}

    public async entregar(mensagem: MensagemInterna): Promise<void> {
        await this.mensageria.publicar(FILAS.envioNotificacoes, { canal: 'INTERNA', ...mensagem });
    }

    public async listar(destinatarioId: string): Promise<MensagemInterna[]> {
        const lista = await this.mensageria.requisitar<Array<Omit<MensagemInterna, 'criadaEm'> & { criadaEm: string }>>(
            FILAS.consultaNotificacoes,
            { operacao: 'listar', args: { destinatarioId } }
        );
        return lista.map((m) => ({ ...m, criadaEm: new Date(m.criadaEm) }));
    }
}

/** Recria o evento que chegou pela fila (as datas chegam como texto). */
export function eventoDeJson(json: unknown): Evento {
    const { tipo, dados, origem, ocorridoEm } = json as { tipo: Evento['tipo']; dados: never; origem: string; ocorridoEm: string };
    return new EventoRecomendacao(tipo, dados, origem, new Date(ocorridoEm)) as Evento;
}

/**
 * Lado do cinebridge-notificacoes:
 * - "envio-notificacoes": e-mails e mensagens internas pedidos pelo cinebridge-api;
 * - "eventos-projetos": eventos do cinebridge-projetos, entregues aos observadores (Observer);
 * - "consulta-notificacoes": leitura da caixa de mensagens.
 */
export async function atenderNotificacoes(
    mensageria: IMensageria,
    canais: { email: IEnviadorEmail; mensagens: ICaixaMensagens },
    observadores: readonly Observador[]
): Promise<void> {
    await mensageria.consumir(FILAS.envioNotificacoes, async (mensagem) => {
        const pedido = mensagem as PedidoEnvio;
        if (pedido.canal === 'EMAIL') {
            await canais.email.enviar({ para: pedido.para, assunto: pedido.assunto, corpo: pedido.corpo });
        } else {
            const { destinatarioId, titulo, texto, criadaEm } = pedido;
            await canais.mensagens.entregar({ destinatarioId, titulo, texto, criadaEm: new Date(criadaEm) });
        }
    });

    await mensageria.consumir(FILAS.eventosProjetos, async (mensagem) => {
        const evento = eventoDeJson(mensagem);
        // Todos os observadores recebem; se algum falhar, a mensagem volta para a fila (ver MensageriaAmqp).
        await Promise.all(observadores.map((o) => o.atualizar(evento)));
    });

    await mensageria.responder(FILAS.consultaNotificacoes, async ({ operacao, args }) => {
        if (operacao !== 'listar') throw new ValidacaoError(`Operação desconhecida em ${FILAS.consultaNotificacoes}: ${operacao}`);
        return canais.mensagens.listar((args as { destinatarioId: string }).destinatarioId);
    });
}
