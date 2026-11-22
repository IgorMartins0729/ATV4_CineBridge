import type { FastifyInstance } from 'fastify';
import type { Container } from '../../../config/container.js';
import type { TipoProjeto } from '../../../domain/enums/TipoProjeto.js';
import { apresentarConvite, apresentarModelo } from '../apresentadores.js';
import { responderSaude } from '../saude.js';
import { schemaConvitePorId, schemaModelos, schemaPreferenciaDecoradores, schemaRespostaConvite } from '../schemas.js';

export function registrarRotasGerais(app: FastifyInstance, container: Container): void {
    const { conviteService, estrategias, repositorios, canais, parametros, prototipos, decoradores, sistema, verificacoesSaude } =
        container;

    // Microsserviço (ATV IV): checa o próprio banco e o RabbitMQ. Monolito em memória: o /health da ATV III.
    app.get('/health', async (_req, resposta) =>
        verificacoesSaude
            ? responderSaude(resposta, verificacoesSaude)
            : { status: 'ok', profissionaisCadastrados: await repositorios.profissionais.contar() }
    );

    app.get('/estrategias', async () => ({
        padrao: parametros.estrategias.selecao.padrao,
        orcamentoReduzido: {
            abaixoDe: parametros.estrategias.selecao.limiteOrcamentoReduzido,
            estrategia: parametros.estrategias.selecao.estrategiaOrcamentoReduzido
        },
        disponiveis: estrategias.listar().map((e) => ({ nome: e.nome, descricao: e.descricao })),
        // Decorator: camadas aplicadas por padrão, da mais interna para a mais externa.
        decoradores: parametros.decoradores.padrao,
        // Adapter: provedor em uso em cada serviço externo.
        integracoes: Object.fromEntries(Object.entries(sistema.getAdaptadores()).map(([servico, a]) => [servico, a.provedor]))
    }));

    // Preferência do produtor: pilha de decoradores usada nas recomendações dos projetos dele.
    // shortcut: guardada só em memória (some ao reiniciar); para produção, persistir junto do cadastro do produtor.
    app.put<{ Params: { id: string }; Body: { decoradores: string[] } }>(
        '/produtores/:id/decoradores',
        { schema: schemaPreferenciaDecoradores },
        async (req) => ({ produtorId: req.params.id, decoradores: decoradores.definirPreferencia(req.params.id, req.body.decoradores) })
    );

    // Modelos pré-configurados (protótipos) que o produtor pode usar no campo "modelo" ao criar um projeto.
    app.get<{ Querystring: { tipoProjeto?: TipoProjeto } }>('/modelos', { schema: schemaModelos }, async (req) =>
        prototipos.listar(req.query.tipoProjeto).map(apresentarModelo)
    );

    app.get<{ Params: { id: string } }>('/convites/:id', { schema: schemaConvitePorId }, async (req) => {
        return apresentarConvite(await conviteService.buscar(req.params.id));
    });

    // Ação do profissional: aceitar ou recusar o convite.
    app.post<{ Params: { id: string }; Body: { aceito: boolean } }>(
        '/convites/:id/resposta',
        { schema: schemaRespostaConvite },
        async (req) => apresentarConvite(await conviteService.responder(req.params.id, req.body.aceito))
    );

    // Consultas para acompanhar o que os observadores fizeram.
    app.get<{ Params: { destinatarioId: string } }>('/mensagens/:destinatarioId', async (req) => {
        return canais.mensagens.listar(req.params.destinatarioId);
    });

    app.get('/auditoria', async () => canais.auditoria.listar());
}
