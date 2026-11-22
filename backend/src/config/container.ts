import { FabricaAnimacao } from '../application/fabricas/animacao/FabricaAnimacao.js';
import { FabricaDocumentario } from '../application/fabricas/documentario/FabricaDocumentario.js';
import { FabricaGeral } from '../application/fabricas/geral/FabricaGeral.js';
import { FabricaPublicitario } from '../application/fabricas/publicitario/FabricaPublicitario.js';
import { RegistroFabricas } from '../application/fabricas/RegistroFabricas.js';
import { AtualizadorComposicaoEquipe } from '../application/observers/AtualizadorComposicaoEquipe.js';
import { criarRegistroPrototipos } from '../application/prototipos/catalogoPrototipos.js';
import { AuditoriaRecomendacao } from '../application/observers/AuditoriaRecomendacao.js';
import { NotificadorEmail } from '../application/observers/NotificadorEmail.js';
import { NotificadorInterno } from '../application/observers/NotificadorInterno.js';
import { SistemaRecomendacao, type Adaptadores } from '../application/observers/SistemaRecomendacao.js';
import { OrquestradorPadrao } from '../application/orquestrador/OrquestradorPadrao.js';
import type { ICaixaMensagens, IEnviadorEmail } from '../application/ports/ICanaisNotificacao.js';
import type { IConviteRepository } from '../application/ports/IConviteRepository.js';
import type { IEventBus } from '../application/ports/IEventBus.js';
import type { ILogger } from '../application/ports/ILogger.js';
import type { IProfissionalRepository } from '../application/ports/IProfissionalRepository.js';
import type { IProjetoRepository } from '../application/ports/IProjetoRepository.js';
import type { IRecomendacaoRepository } from '../application/ports/IRecomendacaoRepository.js';
import { ConviteService } from '../application/services/ConviteService.js';
import { GestaoEquipeService } from '../application/services/GestaoEquipeService.js';
import { ProjetoService } from '../application/services/ProjetoService.js';
import { ProvedorProfissionais } from '../application/services/ProvedorProfissionais.js';
import { FiltragemColaborativa } from '../application/strategies/FiltragemColaborativa.js';
import { RegistroEstrategias } from '../application/strategies/RegistroEstrategias.js';
import { RegrasOrcamento } from '../application/strategies/RegrasOrcamento.js';
import { SimilaridadeCosseno } from '../application/strategies/SimilaridadeCosseno.js';
import { AuditoriaDecorator } from '../application/strategies/decoradores/AuditoriaDecorator.js';
import { CacheDecorator } from '../application/strategies/decoradores/CacheDecorator.js';
import { CompressaoDecorator } from '../application/strategies/decoradores/CompressaoDecorator.js';
import { PoliticaDecoradores } from '../application/strategies/decoradores/PoliticaDecoradores.js';
import { AdaptadorGoogleCloud } from '../infrastructure/adaptadores/armazenamento/AdaptadorGoogleCloud.js';
import { AdaptadorLocal } from '../infrastructure/adaptadores/armazenamento/AdaptadorLocal.js';
import { AdaptadorS3 } from '../infrastructure/adaptadores/armazenamento/AdaptadorS3.js';
import { AdaptadorPagSeguro } from '../infrastructure/adaptadores/pagamento/AdaptadorPagSeguro.js';
import { AdaptadorPayPal } from '../infrastructure/adaptadores/pagamento/AdaptadorPayPal.js';
import { AdaptadorStripe } from '../infrastructure/adaptadores/pagamento/AdaptadorStripe.js';
import { AdaptadorIndeed } from '../infrastructure/adaptadores/profissionais/AdaptadorIndeed.js';
import { AdaptadorInterno } from '../infrastructure/adaptadores/profissionais/AdaptadorInterno.js';
import { AdaptadorLinkedIn } from '../infrastructure/adaptadores/profissionais/AdaptadorLinkedIn.js';
import { ApiGoogleCloudStorageSimulada } from '../infrastructure/externos/ApiGoogleCloudStorageSimulada.js';
import { ApiIndeedSimulada } from '../infrastructure/externos/ApiIndeedSimulada.js';
import { ApiLinkedInSimulada } from '../infrastructure/externos/ApiLinkedInSimulada.js';
import { ApiPagSeguroSimulada } from '../infrastructure/externos/ApiPagSeguroSimulada.js';
import { ApiPayPalSimulada } from '../infrastructure/externos/ApiPayPalSimulada.js';
import { ApiS3Simulada } from '../infrastructure/externos/ApiS3Simulada.js';
import { ApiStripeSimulada } from '../infrastructure/externos/ApiStripeSimulada.js';
import type { Profissional } from '../domain/entities/Profissional.js';
import { NodeEventBus } from '../infrastructure/events/NodeEventBus.js';
import type { Verificacoes } from '../infrastructure/http/saude.js';
import { IntegracaoMicrosservico } from '../infrastructure/integracoes/IntegracaoMicrosservico.js';
import { LoggerMemoria } from '../infrastructure/logging/LoggerMemoria.js';
import { CaixaMensagensMemoria } from '../infrastructure/notificacoes/CaixaMensagensMemoria.js';
import { EnviadorEmailSimulado } from '../infrastructure/notificacoes/EnviadorEmailSimulado.js';
import { RegistroAuditoriaLog } from '../infrastructure/notificacoes/RegistroAuditoriaLog.js';
import { ConviteRepositoryMemoria } from '../infrastructure/repositories/memoria/ConviteRepositoryMemoria.js';
import { ProfissionalRepositoryMemoria } from '../infrastructure/repositories/memoria/ProfissionalRepositoryMemoria.js';
import { ProjetoRepositoryMemoria } from '../infrastructure/repositories/memoria/ProjetoRepositoryMemoria.js';
import { RecomendacaoRepositoryMemoria } from '../infrastructure/repositories/memoria/RecomendacaoRepositoryMemoria.js';
import { PARAMETROS_PADRAO, type ConfigIntegracoes, type ParametrosCineBridge } from './parametros.js';

export interface Repositorios {
    profissionais: IProfissionalRepository;
    projetos: IProjetoRepository;
    convites: IConviteRepository;
    recomendacoes: IRecomendacaoRepository;
}

export interface OpcoesContainer {
    parametros?: ParametrosCineBridge;
    logger?: ILogger;
    /** Troca qualquer repositório (ex.: Prisma em produção, repositório que falha nos testes). */
    repositorios?: Partial<Repositorios>;
    /** Profissionais iniciais do repositório em memória. */
    profissionais?: Profissional[];
    /** Fonte alternativa usada pelo fallback quando o repositório principal cai. */
    fallbackProfissionais?: IProfissionalRepository;
    relogio?: () => Date;
    /** Troca qualquer adaptador externo (ex.: um gateway que falha nos testes). */
    adaptadores?: Partial<Adaptadores>;
    /** ATV IV: canais que publicam no RabbitMQ para o cinebridge-notificacoes enviar. */
    canais?: Partial<{ email: IEnviadorEmail; mensagens: ICaixaMensagens }>;
    /** ATV IV: dependências checadas pelo /health (banco e RabbitMQ). Sem elas, o /health é o da ATV III. */
    verificacoesSaude?: Verificacoes;
}

/**
 * Adapter: um adaptador por provedor, cada um sobre a API (simulada) do seu sistema externo.
 * As APIs simuladas são criadas uma vez, para que trocar de provedor e voltar mantenha os dados.
 */
function criarCatalogoAdaptadores(config: ConfigIntegracoes, repositorioInterno: IProfissionalRepository) {
    const s3 = new ApiS3Simulada();
    const googleCloud = new ApiGoogleCloudStorageSimulada();
    const stripe = new ApiStripeSimulada();
    const pagSeguro = new ApiPagSeguroSimulada();
    const payPal = new ApiPayPalSimulada();
    const linkedIn = new ApiLinkedInSimulada();
    const indeed = new ApiIndeedSimulada();
    return {
        armazenamento: {
            s3: new AdaptadorS3(s3, config.bucket),
            'google-cloud': new AdaptadorGoogleCloud(googleCloud),
            local: new AdaptadorLocal(config.diretorioArquivos)
        },
        pagamento: {
            stripe: new AdaptadorStripe(stripe),
            pagseguro: new AdaptadorPagSeguro(pagSeguro),
            paypal: new AdaptadorPayPal(payPal)
        },
        profissional: {
            interno: new AdaptadorInterno(repositorioInterno),
            linkedin: new AdaptadorLinkedIn(linkedIn),
            indeed: new AdaptadorIndeed(indeed)
        }
    };
}

/**
 * Composition root: o único lugar que conhece as classes concretas.
 * Todo o resto recebe as dependências pelo construtor (injeção de dependências explícita).
 */
export function criarContainer(opcoes: OpcoesContainer = {}) {
    const parametros = opcoes.parametros ?? PARAMETROS_PADRAO;
    const logger = opcoes.logger ?? new LoggerMemoria();
    const eventBus: IEventBus = new NodeEventBus(logger);

    const repositorios: Repositorios = {
        profissionais: opcoes.repositorios?.profissionais ?? new ProfissionalRepositoryMemoria(opcoes.profissionais ?? []),
        projetos: opcoes.repositorios?.projetos ?? new ProjetoRepositoryMemoria(),
        convites: opcoes.repositorios?.convites ?? new ConviteRepositoryMemoria(),
        recomendacoes: opcoes.repositorios?.recomendacoes ?? new RecomendacaoRepositoryMemoria()
    };

    const estrategias = new RegistroEstrategias(
        [
            new SimilaridadeCosseno(parametros.estrategias.cosseno),
            new FiltragemColaborativa(parametros.estrategias.colaborativa),
            new RegrasOrcamento(parametros.estrategias.orcamento)
        ],
        parametros.estrategias.selecao
    );

    const catalogoAdaptadores = criarCatalogoAdaptadores(parametros.integracoes, repositorios.profissionais);
    const adaptadores: Adaptadores = {
        armazenamento:
            opcoes.adaptadores?.armazenamento ?? catalogoAdaptadores.armazenamento[parametros.integracoes.armazenamento],
        pagamento: opcoes.adaptadores?.pagamento ?? catalogoAdaptadores.pagamento[parametros.integracoes.pagamento],
        profissional: opcoes.adaptadores?.profissional ?? catalogoAdaptadores.profissional[parametros.integracoes.profissionais]
    };

    const provedor = new ProvedorProfissionais({
        fonte: adaptadores.profissional,
        logger,
        config: parametros.resiliencia,
        ...(opcoes.fallbackProfissionais ? { fallback: new AdaptadorInterno(opcoes.fallbackProfissionais) } : {})
    });

    const canais = {
        email: opcoes.canais?.email ?? new EnviadorEmailSimulado(logger),
        mensagens: opcoes.canais?.mensagens ?? new CaixaMensagensMemoria(),
        auditoria: new RegistroAuditoriaLog(logger)
    };

    // Prototype + Abstract Factory: um protótipo e uma fábrica por tipo de projeto.
    // Um tipo novo (ex.: realidade virtual) entra aqui, sem mexer no orquestrador.
    const prototipos = criarRegistroPrototipos();
    const fabricas = new RegistroFabricas([
        new FabricaGeral(canais, estrategias.padrao(), prototipos),
        new FabricaDocumentario(canais, prototipos),
        new FabricaAnimacao(canais, prototipos),
        new FabricaPublicitario(canais, prototipos)
    ]);

    // Decorator: a pilha (e a ordem) vem da configuração ou da preferência do produtor.
    const relogio = opcoes.relogio;
    const decoradores = new PoliticaDecoradores(parametros.decoradores, {
        cache: (interno) =>
            new CacheDecorator(interno, parametros.decoradores.cache, relogio ? () => relogio().getTime() : Date.now),
        auditoria: (interno) => new AuditoriaDecorator(interno, logger),
        compressao: (interno) => new CompressaoDecorator(interno)
    });

    const sistema = new SistemaRecomendacao({
        adaptadores,
        decorarEstrategia: (estrategia, projeto) => decoradores.aplicar(estrategia, projeto),
        fabricas,
        criarOrquestrador: (fabrica, candidatos) =>
            new OrquestradorPadrao(fabrica, candidatos, {
                quantidadeSugestoes: parametros.orquestrador.quantidadeSugestoes,
                ...(opcoes.relogio ? { relogio: opcoes.relogio } : {})
            }),
        provedor,
        estrategias,
        eventBus,
        recomendacoes: repositorios.recomendacoes,
        logger
    });

    const projetoService = new ProjetoService({ projetos: repositorios.projetos, estrategias, fabricas, prototipos });
    const gestaoEquipe = new GestaoEquipeService({
        projetos: repositorios.projetos,
        convites: repositorios.convites,
        sistema,
        config: parametros.reavaliacao,
        ...(opcoes.relogio ? { relogio: opcoes.relogio } : {})
    });
    const conviteService = new ConviteService({
        convites: repositorios.convites,
        projetos: repositorios.projetos,
        sistema
    });

    const integracoes = {
        gerenciamentoProjetos: new IntegracaoMicrosservico('gerenciamento-projetos', logger),
        financeiro: new IntegracaoMicrosservico('processamento-financeiro', logger)
    };
    const observadores = [
        new NotificadorEmail(canais.email),
        new NotificadorInterno(canais.mensagens),
        new AuditoriaRecomendacao(canais.auditoria),
        new AtualizadorComposicaoEquipe(gestaoEquipe),
        integracoes.gerenciamentoProjetos,
        integracoes.financeiro
    ];
    for (const observador of observadores) {
        sistema.adicionarObservador(observador);
    }

    return {
        parametros,
        logger,
        eventBus,
        repositorios,
        estrategias,
        prototipos,
        fabricas,
        provedor,
        catalogoAdaptadores,
        decoradores,
        sistema,
        projetoService,
        gestaoEquipe,
        conviteService,
        canais,
        integracoes,
        verificacoesSaude: opcoes.verificacoesSaude
    };
}

export type Container = ReturnType<typeof criarContainer>;
