import type { Projeto } from '../../domain/entities/Projeto.js';
import type { Papel } from '../../domain/enums/Papel.js';
import { StatusEquipe } from '../../domain/enums/StatusEquipe.js';
import { ConflitoError } from '../../domain/erros.js';
import type { AdaptadorPagamento, StatusPagamento } from '../ports/AdaptadorPagamento.js';

export interface PagamentoMembro {
    papel: Papel;
    profissionalId: string;
    valor: number;
    transacaoId: string;
    status: StatusPagamento;
    provedor: string;
}

/**
 * Paga cada membro da equipe formada (preço médio do profissional, do produtor para o profissional).
 * Só conhece o contrato AdaptadorPagamento: Stripe, PagSeguro ou PayPal dão o mesmo resultado.
 *
 * Se um pagamento falhar no meio, os anteriores são estornados (nada fica pago pela metade).
 * shortcut: não há chave de idempotência nem registro persistente dos pagamentos; chamar duas vezes paga duas vezes.
 * Para produção, gravar os pagamentos e recusar um segundo pagamento da mesma equipe.
 */
export async function pagarEquipe(projeto: Projeto, pagamento: AdaptadorPagamento): Promise<PagamentoMembro[]> {
    const equipe = projeto.getEquipe();
    if (!equipe || equipe.getStatus() !== StatusEquipe.FORMADA) {
        throw new ConflitoError('Só é possível pagar uma equipe formada (todos os convites aceitos)');
    }

    const feitos: PagamentoMembro[] = [];
    try {
        for (const membro of equipe.getMembros()) {
            const profissional = membro.getProfissional();
            const valor = Math.round(profissional.getPrecoMedio() * 100) / 100;
            const transacaoId = await pagamento.efetuarPagamento(valor, projeto.getProdutor().id, profissional.getId());
            // Entra na lista antes de consultar o status: se a consulta falhar, a cobrança ainda é estornada.
            const feito: PagamentoMembro = {
                papel: membro.getPapel(),
                profissionalId: profissional.getId(),
                valor,
                transacaoId,
                status: 'PENDENTE',
                provedor: pagamento.provedor
            };
            feitos.push(feito);
            const status = await pagamento.verificarPagamento(transacaoId);
            feito.status = status;
            if (status === 'RECUSADO') {
                throw new ConflitoError(`Pagamento de ${profissional.getNome()} recusado pelo gateway ${pagamento.provedor}`);
            }
        }
    } catch (erro) {
        // PENDENTE também: um pagamento ainda em processamento seria concluído depois do erro.
        const estornar = feitos.filter((f) => f.status === 'APROVADO' || f.status === 'PENDENTE');
        await Promise.allSettled(estornar.map((f) => pagamento.cancelarPagamento(f.transacaoId)));
        throw erro;
    }
    return feitos;
}
