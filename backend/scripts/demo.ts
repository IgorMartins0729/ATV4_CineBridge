import type { Observador } from '../src/application/observers/Observador.js';
import { OrquestradorEquipe } from '../src/application/orquestrador/OrquestradorEquipe.js';
import { OrquestradorPadrao } from '../src/application/orquestrador/OrquestradorPadrao.js';
import { CalculadorCompatibilidade } from '../src/application/visitors/CalculadorCompatibilidade.js';
import { GeradorRelatorio } from '../src/application/visitors/GeradorRelatorio.js';
import { ValidadorConsistencia } from '../src/application/visitors/ValidadorConsistencia.js';
import { criarContainer } from '../src/config/container.js';
import type { Profissional } from '../src/domain/entities/Profissional.js';
import type { Projeto } from '../src/domain/entities/Projeto.js';
import { Papel, rotuloPapel } from '../src/domain/enums/Papel.js';
import { TipoCaptacao } from '../src/domain/enums/TipoCaptacao.js';
import { TipoProjeto } from '../src/domain/enums/TipoProjeto.js';
import { gerarProfissionais } from '../src/infrastructure/dados/geradorProfissionais.js';
import { LoggerMemoria } from '../src/infrastructure/logging/LoggerMemoria.js';
import { SimilaridadeCosseno } from '../src/application/strategies/SimilaridadeCosseno.js';
import { AuditoriaDecorator } from '../src/application/strategies/decoradores/AuditoriaDecorator.js';
import { CacheDecorator } from '../src/application/strategies/decoradores/CacheDecorator.js';
import { CompressaoDecorator } from '../src/application/strategies/decoradores/CompressaoDecorator.js';
import type { Camada } from '../src/application/strategies/decoradores/PoliticaDecoradores.js';
import type { ServicoProjeto } from '../src/domain/servicos/ServicoProjeto.js';
import type { EnviadorEmailSimulado } from '../src/infrastructure/notificacoes/EnviadorEmailSimulado.js';

/** Demonstração dos padrões das ATV I, II e III com casos de uso concretos. Uso: npm run demo */

const titulo = (texto: string): void => console.log(`\n${'='.repeat(70)}\n${texto}\n${'='.repeat(70)}`);
const moeda = (valor: number): string => `R$ ${Math.round(valor).toLocaleString('pt-BR')}`;

const container = criarContainer({ profissionais: gerarProfissionais(2_000), logger: new LoggerMemoria() });
const prazo = new Date(Date.now() + 200 * 86_400_000);
const dadosProjeto = {
    titulo: 'Vozes do Sertão',
    produtor: { id: 'produtora-1', nome: 'Paula Lima', email: 'paula@produtora.com' },
    genero: 'drama',
    duracao: 95,
    orcamento: 180_000,
    prazo,
    tipoCaptacao: TipoCaptacao.FICCAO,
    localizacao: { cidade: 'Recife', uf: 'PE' },
    papeisObrigatorios: [
        { papel: Papel.DIRETOR, peso: 3 },
        { papel: Papel.DIRETOR_FOTOGRAFIA, peso: 2 },
        { papel: Papel.EDITOR, peso: 1 }
    ]
};

// ---------------------------------------------------------------------------------------------
titulo('1) STRATEGY - a troca de estratégia altera o resultado da recomendação');
for (const estrategia of container.estrategias.listar()) {
    const projeto = await container.projetoService.criar({ ...dadosProjeto, estrategia: estrategia.nome });
    const { recomendacao } = await container.sistema.executarRecomendacao(projeto);
    const top = recomendacao.getCandidatos(Papel.DIRETOR).slice(0, 3);
    console.log(`\n[${estrategia.nome}] ${estrategia.descricao}`);
    for (const [i, c] of top.entries()) {
        const p = c.profissional;
        console.log(
            `  ${i + 1}º ${p.getNome().padEnd(20)} nota ${c.pontuacao.toFixed(3)} | ${moeda(p.getPrecoMedio()).padEnd(11)} | ` +
                `avaliação ${p.mediaAvaliacoes().toFixed(1)} | ${p.getLocalizacao().toString()}`
        );
    }
}

// ---------------------------------------------------------------------------------------------
titulo('2) TEMPLATE METHOD - o fluxo principal é fixo; subclasses só mudam as etapas');
class OrquestradorComLog extends OrquestradorEquipe {
    readonly etapas: string[] = [];
    constructor(candidatos: readonly Profissional[]) {
        super(container.fabricas.obter(TipoProjeto.GERAL), candidatos, { quantidadeSugestoes: 1 });
    }
    protected validarRestricoes(): boolean {
        this.etapas.push('1. validarRestricoes');
        return true;
    }
    protected normalizarDados(_p: Projeto, profissionais: readonly Profissional[]): Profissional[] {
        this.etapas.push('2. normalizarDados');
        return [...profissionais];
    }
    protected posProcessar(recomendacoes: Map<Papel, Profissional[]>): Map<Papel, Profissional[]> {
        this.etapas.push('3. posProcessar');
        return recomendacoes;
    }
}
const orquestrador = new OrquestradorComLog(await container.repositorios.profissionais.listarTodos());
const projetoTemplate = await container.projetoService.criar(dadosProjeto);
orquestrador.orquestrar(projetoTemplate, container.estrategias.obter('similaridade-cosseno'));
console.log('Ordem das etapas chamadas pelo método template:', orquestrador.etapas.join(' -> '));
try {
    class OrquestradorRebelde extends OrquestradorPadrao {
        override orquestrar(): never {
            throw new Error('fluxo alterado');
        }
    }
    new OrquestradorRebelde(container.fabricas.obter(TipoProjeto.GERAL), []);
} catch (erro) {
    console.log('Tentativa de sobrescrever o fluxo:', (erro as Error).message);
}

// ---------------------------------------------------------------------------------------------
titulo('3) OBSERVER - observadores reagem de forma independente aos eventos');
console.log('Observadores registrados:', container.sistema.getObservadores().join(', '));
const quebrado: Observador = {
    nome: 'ObservadorComDefeito',
    atualizar: () => {
        throw new Error('servidor SMTP fora do ar');
    }
};
container.sistema.adicionarObservador(quebrado);
const emailsAntes = (container.canais.email as EnviadorEmailSimulado).getEnviados().length;
const auditoriaAntes = (await container.canais.auditoria.listar()).length;

const projeto = await container.projetoService.criar(dadosProjeto);
await container.gestaoEquipe.recomendarEquipe(projeto.getId());
container.sistema.removerObservador(quebrado);

console.log(`Mesmo com um observador falhando: +${(container.canais.email as EnviadorEmailSimulado).getEnviados().length - emailsAntes} e-mails,`,
    `+${(await container.canais.auditoria.listar()).length - auditoriaAntes} registro(s) de auditoria`);
const exemploEmail = (container.canais.email as EnviadorEmailSimulado).getEnviados().at(-1);
console.log(`Exemplo de e-mail -> ${exemploEmail?.para}: "${exemploEmail?.assunto}"`);

console.log('\nProdutor aceita os sugeridos; os profissionais respondem aos convites:');
for (const requisito of projeto.getPapeisObrigatorios()) {
    const convite = await container.gestaoEquipe.aceitarMembro(projeto.getId(), requisito.getPapel());
    const aceita = requisito.getPapel() !== Papel.EDITOR; // o editor vai recusar
    await container.conviteService.responder(convite.getId(), aceita);
    console.log(`  ${rotuloPapel(requisito.getPapel()).padEnd(22)} ${convite.getProfissional().getNome().padEnd(20)} ${aceita ? 'ACEITOU' : 'RECUSOU'}`);
}
const novoEditor = projeto.getEquipe()!.obterMembro(Papel.EDITOR)!.getProfissional();
console.log(`Recusa observada -> nova rodada só para Edição: ${novoEditor.getNome()} (demais membros mantidos)`);
const conviteEditor = await container.gestaoEquipe.aceitarMembro(projeto.getId(), Papel.EDITOR);
await container.conviteService.responder(conviteEditor.getId(), true);
console.log(`Equipe: ${projeto.getEquipe()!.getStatus()} | eventos enviados ao financeiro: ${container.integracoes.financeiro.getEnviados().length},`,
    `ao gerenciamento de projetos: ${container.integracoes.gerenciamentoProjetos.getEnviados().length}`);
const tipos = (await container.canais.auditoria.listar()).map((r) => r.tipo);
console.log('Trilha de auditoria (tipos):', [...new Set(tipos)].join(', '));

// ---------------------------------------------------------------------------------------------
titulo('4) VISITOR - operações diferentes sobre a mesma estrutura, sem alterar as classes');
const validador = new ValidadorConsistencia();
console.log('ValidadorConsistencia  ->', projeto.aceitar(validador), validador.getProblemas());
console.log('CalculadorCompatibilidade ->', projeto.aceitar(new CalculadorCompatibilidade()), '/ 100');
console.log('GeradorRelatorio ->\n');
console.log(projeto.aceitar(new GeradorRelatorio()));

// ---------------------------------------------------------------------------------------------
titulo('5) PROTOTYPE + FACTORY METHOD + ABSTRACT FACTORY - um tipo de projeto, uma família de objetos');
const base = {
    titulo: 'Projeto da demonstração',
    produtor: dadosProjeto.produtor,
    orcamento: 400_000,
    prazo: dadosProjeto.prazo,
    localizacao: dadosProjeto.localizacao
};
const exemplos = [
    { tipoProjeto: TipoProjeto.DOCUMENTARIO, especificos: { tema: 'Seca no Nordeste', entrevistados: ['Dona Maria'] } },
    { tipoProjeto: TipoProjeto.ANIMACAO, especificos: { tecnica: '3D', softwares: ['Blender'] } },
    { tipoProjeto: TipoProjeto.PUBLICITARIO, especificos: { cliente: 'Café Bom', veiculacao: ['TV'] } }
];
for (const exemplo of exemplos) {
    const fabrica = container.fabricas.obter(exemplo.tipoProjeto);
    const projetoTipo = await container.projetoService.criar({ ...base, ...exemplo });
    const { recomendacao } = await container.sistema.executarRecomendacao(projetoTipo);
    const mensagem = (await container.canais.mensagens.listar(base.produtor.id)).at(-1);
    console.log(`\n[${exemplo.tipoProjeto}] ${fabrica.constructor.name}: clonou o modelo -> ${projetoTipo.constructor.name}`);
    console.log(`  papéis do modelo: ${projetoTipo.getPapeis().map(rotuloPapel).join(', ')}`);
    console.log(`  recomendador: ${recomendacao.getEstrategia()} | validador: ${fabrica.criarValidador().constructor.name}`);
    console.log(`  notificação ao produtor: "${mensagem?.titulo}"`);
}
const modelo = container.prototipos.clonar('documentario');
const copia = modelo.clonar();
console.log('\nClone profundo: mesmo conteúdo, objetos diferentes ->',
    copia !== modelo && copia.getPapeisObrigatorios() !== modelo.getPapeisObrigatorios());

// ---------------------------------------------------------------------------------------------
titulo('6) ATV III: COMPOSITE - o projeto é uma hierarquia de serviços');
const animacao = container.prototipos.clonar('animacao');
const imprimir = (servico: ServicoProjeto, nivel = 0): void => {
    console.log(`${'  '.repeat(nivel)}- ${servico.nome}: ${moeda(servico.calcularCusto())}, ${servico.obterPrazo()} dias`);
    for (const filho of servico.listarSubservicos()) imprimir(filho, nivel + 1);
};
imprimir(animacao.getServicoPrincipal());
console.log(`Projeto.calcularCustoTotal() delega à raiz: ${moeda(animacao.calcularCustoTotal())}`);
console.log(`Papéis derivados das folhas: ${animacao.getPapeisObrigatorios().map((r) => `${rotuloPapel(r.getPapel())} (${r.getPeso()})`).join(', ')}`);

// ---------------------------------------------------------------------------------------------
titulo('7) ATV III: DECORATOR - cache, auditoria e compressão em volta do recomendador');
const camadas: Camada[] = ['cache', 'auditoria', 'compressao'];
const cache = new CacheDecorator(new SimilaridadeCosseno());
const auditoria = new AuditoriaDecorator(cache, new LoggerMemoria());
const compressao = new CompressaoDecorator(auditoria);
const candidatos = await container.repositorios.profissionais.listarTodos();
const projetoDecorado = await container.projetoService.criar(dadosProjeto);
for (const rodada of [1, 2]) {
    const inicio = performance.now();
    compressao.recomendar(projetoDecorado, candidatos);
    console.log(`  rodada ${rodada}: ${(performance.now() - inicio).toFixed(1)} ms`);
}
const pacote = compressao.ultimoPacote()!;
console.log(`Pilha (${camadas.join(' -> ')}): ${JSON.stringify(cache.estatisticas())}`);
console.log(`Auditoria: ${auditoria.getRegistros().length} chamadas registradas (inclui o acerto de cache)`);
console.log(`Compressão: ${pacote.tamanhoOriginal} bytes -> ${pacote.tamanhoTransmitido} bytes`);

// ---------------------------------------------------------------------------------------------
titulo('8) ATV III: ADAPTER - trocar o provedor externo sem mudar a lógica de negócio');
const { catalogoAdaptadores: catalogo, sistema } = container;
for (const nome of ['stripe', 'pagseguro', 'paypal'] as const) {
    const { armazenamento, profissional } = sistema.getAdaptadores();
    sistema.configurarAdaptadores(armazenamento, catalogo.pagamento[nome], profissional);
    const id = await sistema.getAdaptadores().pagamento.efetuarPagamento(1_500, 'produtora-1', 'profissional-1');
    console.log(`  [${nome}] pagamento ${id} -> ${await sistema.getAdaptadores().pagamento.verificarPagamento(id)}`);
}
for (const nome of ['s3', 'google-cloud'] as const) {
    const { pagamento, profissional } = sistema.getAdaptadores();
    sistema.configurarAdaptadores(catalogo.armazenamento[nome], pagamento, profissional);
    const id = await sistema.anexarArquivo('demo', Buffer.from('roteiro'), { nome: 'roteiro.pdf' });
    console.log(`  [${nome}] arquivo salvo: ${id}`);
}
for (const nome of ['linkedin', 'indeed'] as const) {
    const lista = await catalogo.profissional[nome].listarProfissionais({ papeis: Object.values(Papel) });
    console.log(`  [${nome}] ${lista.map((p) => `${p.getNome()} (${p.getEspecialidades().map(rotuloPapel).join('/')})`).join(', ')}`);
}
