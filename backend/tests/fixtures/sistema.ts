import type { IEnviadorEmail } from '../../src/application/ports/ICanaisNotificacao.js';
import { FabricaAnimacao } from '../../src/application/fabricas/animacao/FabricaAnimacao.js';
import type { CanaisNotificador } from '../../src/application/fabricas/base/NotificadorTipoProjeto.js';
import { FabricaDocumentario } from '../../src/application/fabricas/documentario/FabricaDocumentario.js';
import { FabricaGeral } from '../../src/application/fabricas/geral/FabricaGeral.js';
import { FabricaPublicitario } from '../../src/application/fabricas/publicitario/FabricaPublicitario.js';
import { RegistroFabricas } from '../../src/application/fabricas/RegistroFabricas.js';
import { OrquestradorPadrao } from '../../src/application/orquestrador/OrquestradorPadrao.js';
import { SistemaRecomendacao, type DependenciasSistema } from '../../src/application/observers/SistemaRecomendacao.js';
import type { IProfissionalRepository } from '../../src/application/ports/IProfissionalRepository.js';
import { ProvedorProfissionais } from '../../src/application/services/ProvedorProfissionais.js';
import { FiltragemColaborativa } from '../../src/application/strategies/FiltragemColaborativa.js';
import { RegistroEstrategias } from '../../src/application/strategies/RegistroEstrategias.js';
import { RegrasOrcamento } from '../../src/application/strategies/RegrasOrcamento.js';
import { SimilaridadeCosseno } from '../../src/application/strategies/SimilaridadeCosseno.js';
import type { Profissional } from '../../src/domain/entities/Profissional.js';
import { AdaptadorS3 } from '../../src/infrastructure/adaptadores/armazenamento/AdaptadorS3.js';
import { AdaptadorStripe } from '../../src/infrastructure/adaptadores/pagamento/AdaptadorStripe.js';
import { AdaptadorInterno } from '../../src/infrastructure/adaptadores/profissionais/AdaptadorInterno.js';
import { ApiS3Simulada } from '../../src/infrastructure/externos/ApiS3Simulada.js';
import { ApiStripeSimulada } from '../../src/infrastructure/externos/ApiStripeSimulada.js';
import { NodeEventBus } from '../../src/infrastructure/events/NodeEventBus.js';
import { LoggerMemoria } from '../../src/infrastructure/logging/LoggerMemoria.js';
import { CaixaMensagensMemoria } from '../../src/infrastructure/notificacoes/CaixaMensagensMemoria.js';
import { EnviadorEmailSimulado } from '../../src/infrastructure/notificacoes/EnviadorEmailSimulado.js';
import { ProfissionalRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/ProfissionalRepositoryMemoria.js';
import { RecomendacaoRepositoryMemoria } from '../../src/infrastructure/repositories/memoria/RecomendacaoRepositoryMemoria.js';
import { HOJE } from './fabricas.js';

export function criarRegistroEstrategias(): RegistroEstrategias {
    return new RegistroEstrategias([new SimilaridadeCosseno(), new FiltragemColaborativa(), new RegrasOrcamento()], {
        padrao: 'similaridade-cosseno',
        limiteOrcamentoReduzido: 50_000,
        estrategiaOrcamentoReduzido: 'regras-orcamento'
    });
}

export function criarCanais(logger = new LoggerMemoria()): CanaisNotificador & { mensagens: CaixaMensagensMemoria } {
    return { email: new EnviadorEmailSimulado(logger), mensagens: new CaixaMensagensMemoria() };
}

/** Fábrica do projeto geral (comportamento da ATV1), usada nos testes do orquestrador. */
export function criarFabricaGeral(canais: CanaisNotificador = criarCanais()): FabricaGeral {
    return new FabricaGeral(canais, new SimilaridadeCosseno());
}

export function criarRegistroFabricas(canais: CanaisNotificador = criarCanais()): RegistroFabricas {
    return new RegistroFabricas([
        new FabricaGeral(canais, new SimilaridadeCosseno()),
        new FabricaDocumentario(canais),
        new FabricaAnimacao(canais),
        new FabricaPublicitario(canais)
    ]);
}

export interface OpcoesSistemaTeste {
    profissionais?: Profissional[];
    repositorio?: IProfissionalRepository;
    decorarEstrategia?: DependenciasSistema['decorarEstrategia'];
}

/** Monta o SistemaRecomendacao com dependências em memória, como o container faz. */
export function montarSistema(opcoes: OpcoesSistemaTeste = {}) {
    const logger = new LoggerMemoria();
    const eventBus = new NodeEventBus(logger);
    const repositorio = opcoes.repositorio ?? new ProfissionalRepositoryMemoria(opcoes.profissionais ?? []);
    const recomendacoes = new RecomendacaoRepositoryMemoria();
    const canais = criarCanais(logger);
    const fabricas = criarRegistroFabricas(canais);
    const adaptadores = {
        armazenamento: new AdaptadorS3(new ApiS3Simulada(), 'teste'),
        pagamento: new AdaptadorStripe(new ApiStripeSimulada()),
        profissional: new AdaptadorInterno(repositorio)
    };
    const sistema = new SistemaRecomendacao({
        adaptadores,
        ...(opcoes.decorarEstrategia ? { decorarEstrategia: opcoes.decorarEstrategia } : {}),
        fabricas,
        criarOrquestrador: (fabrica, candidatos) => new OrquestradorPadrao(fabrica, candidatos, { relogio: () => HOJE }),
        // Timeout folgado: o repositório é em memória, e um limite curto falhava em máquina carregada (CI/cobertura).
        provedor: new ProvedorProfissionais({ fonte: adaptadores.profissional, logger, config: { timeoutMs: 5_000 } }),
        estrategias: criarRegistroEstrategias(),
        eventBus,
        recomendacoes,
        logger
    });
    return { sistema, eventBus, logger, recomendacoes, repositorio, canais, fabricas, adaptadores };
}

/** No modo memória o canal de e-mail é o simulado; no modo microsserviço ele publica no RabbitMQ. */
export function emailsSimulados(container: { canais: { email: IEnviadorEmail } }) {
    return (container.canais.email as EnviadorEmailSimulado).getEnviados();
}
