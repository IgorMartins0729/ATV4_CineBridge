# Anti-padrões e refatoração estrutural do CineBridge (ATV II → ATV III)

A introdução do enunciado diz que a terceira atividade *"consistirá justamente em uma análise aprofundada do
código da plataforma cinebridge, com o objetivo de identificar possíveis anti-padrões que tenham sido
introduzidos inadvertidamente e, em seguida, propor refatorações"*. A lista de tarefas, porém, só fala de
Adapter, Composite e Decorator. Este documento cobre as duas partes: a **análise de anti-padrões** (seções 1 e 2)
e a **implementação dos três padrões estruturais** (seção 3).

Referências `ATV2:arquivo:linha` apontam para `ATV2_CineBridge/backend/src`. Referências sem prefixo apontam
para `backend/src` desta pasta.

Um anti-padrão, nos termos do enunciado, precisa de dois critérios: (1) é uma prática recorrente que parece boa e
se mostra contraproducente; (2) existe uma refatoração documentada que a corrige. Cada item abaixo mostra o
sintoma no código, por que ele é um problema e a refatoração aplicada.

---

## 1. Anti-padrões encontrados no código da ATV II

### AP1. Blob em formação: `SistemaRecomendacao`

**Sintoma.** O `SistemaRecomendacao` (ATV2: 182 linhas, 16 membros) já acumulava estes papéis:
- sujeito do Observer;
- seleção da fábrica e da estratégia;
- busca de candidatos;
- persistência da recomendação;
- publicação de eventos.

O diagrama da ATV III acrescenta mais três responsabilidades na mesma classe: armazenamento, pagamento e
cadastro externo. Quem segue o diagrama ao pé da letra termina com o **Objeto Deus** que a própria introdução usa
como exemplo de anti-padrão: uma classe que é ponto central de dependência e de fragilidade.

**Refatoração.** O enunciado exige que os adaptadores sejam injetados no `SistemaRecomendacao`, e os testes do
professor trocam o provedor por ele. Por isso a classe recebe os adaptadores, mas **não** recebe a lógica:
- **pagamento:** a regra (equipe formada, valor de cada membro, estorno em caso de falha) está em
  `application/services/pagamentoEquipe.ts`. O `SistemaRecomendacao.pagarEquipe` é uma linha que delega;
- **mídia:** os métodos de arquivo só definem a pasta do projeto e chamam o adaptador;
- **resiliência da fonte de profissionais:** continua no `ProvedorProfissionais` (timeout, circuit breaker, cache
  e fallback), que agora consome um `AdaptadorProfissional`;
- **cache, auditoria e compressão:** não entram na classe. Ela recebe uma função `decorarEstrategia`, e a pilha
  de decoradores é montada fora dela (`PoliticaDecoradores`).

**Resultado honesto.** A classe passou de 182 para 257 linhas, quase tudo assinaturas e delegações de uma
linha. Ela continua sendo o ponto de entrada mais carregado do sistema. O passo seguinte, fora do escopo desta
atividade, seria separar `ServicoMidia` e `ServicoPagamento` como casos de uso próprios e deixar o
`SistemaRecomendacao` só com a recomendação.

### AP2. Explosão de subclasses para preocupações transversais (herança no lugar de composição)

**Sintoma.** O caminho "natural" para ter cache e auditoria no recomendador seria criar subclasses:
`SimilaridadeCossenoComCache`, `SimilaridadeCossenoComCacheEAuditoria` e assim por diante. Com 3 estratégias
gerais, 3 recomendadores por tipo e 3 preocupações, isso dá até 6 × 2³ = 48 classes. Some-se a isso que as três
estratégias da ATV I repetiam o mesmo final (`RecomendacoesPorPapel.deRanking(ranking)` em
ATV2:`application/strategies/SimilaridadeCosseno.ts:80`, `FiltragemColaborativa.ts:67` e
`RegrasOrcamento.ts:58`).

**Refatoração (Decorator).**
- `RecomendadorBase` concentra o fluxo comum: ranking por papel → `Map` com pontuação. As três estratégias só
  implementam `rankear`.
- `CacheDecorator`, `AuditoriaDecorator` e `CompressaoDecorator` envolvem **qualquer** `RecomendacaoStrategy`,
  inclusive os recomendadores das fábricas.
- São 3 classes em vez de 48, e a combinação e a ordem são escolhidas em tempo de execução.

### AP3. Obsessão por primitivos: o projeto como uma lista plana de papéis

**Sintoma.** `Projeto` guardava `papeisObrigatorios: RequisitoPapel[]` (ATV2:`domain/entities/Projeto.ts:26`)
e **proibia papéis repetidos** (`Projeto.ts:69`). O novo requisito é uma hierarquia de serviços, como uma
pós-produção com edição, coloração e mixagem, cada uma com subserviços. Uma lista plana não representa essa
hierarquia, e a proibição impede o caso real de dois serviços que exigem o mesmo papel (o editor monta e também
colore). Com a lista, custo e prazo também não tinham onde morar.

**Refatoração (Composite).**
- `Projeto.servicoPrincipal: ServicoProjeto`. `ServicoAtomico` é a folha (papel, custo, prazo, peso) e
  `PacoteServico` é o nó composto.
- `calcularCustoTotal()` só delega à raiz. A validação é recursiva e aponta o caminho do erro
  ("Pós > Mixagem: custo deve ser zero ou positivo").
- Os papéis obrigatórios passaram a ser **derivados** das folhas: o mesmo papel em vários serviços vira um
  requisito só, com os pesos somados.
- Com isso o orquestrador, as estratégias, a verba por papel e o ranking **não mudaram nenhuma linha**.

### AP4. Acoplamento a uma única fonte concreta (vendor lock-in)

**Sintoma.** O `ProvedorProfissionais` dependia de `IProfissionalRepository` (ATV2:
`application/services/ProvedorProfissionais.ts:32` e `:72`), ou seja, do banco próprio. Para buscar candidatos no
LinkedIn seria preciso:
- um `if (fonte === 'linkedin')` no provedor;
- o formato do LinkedIn (cargos em inglês, proficiência em texto, preço em outro campo) espalhado pelo núcleo.

O mesmo valeria para pagamento e armazenamento, que nem existiam.

**Refatoração (Adapter).**
- Três portas padronizadas (`application/ports/Adaptador*.ts`).
- Uma API simulada **por provedor**, cada uma com o formato do seu provedor:
  - S3: buckets, `Uint8Array` e listagem paginada;
  - Google Cloud: objetos `File`;
  - Stripe: centavos inteiros e estorno como objeto separado;
  - PagSeguro: status numérico;
  - PayPal: criar pedido + capturar, com valor em texto;
  - LinkedIn: proficiência `EXPERT`/`ADVANCED`;
  - Indeed: centavos, "Cidade, UF" e habilidades sem nível.
- Nove adaptadores que traduzem esses formatos. O núcleo só conhece as portas.

### AP5. Copiar e colar (o filtro de candidatos)

**Sintoma.** A regra "tem o papel, está disponível na data, cabe no preço e não foi excluído" estava dentro do
repositório em memória (ATV2:`infrastructure/repositories/memoria/ProfissionalRepositoryMemoria.ts:26-29`). As
fontes externas filtram menos na origem (o LinkedIn só filtra por cargo), então cada adaptador teria uma cópia
dessa regra.

**Refatoração.** `atendeFiltro` foi extraída para `application/ports/IProfissionalRepository.ts` e é usada pelo
repositório em memória, pelo `AdaptadorLinkedIn` e pelo `AdaptadorIndeed`.

### AP6. Estado em memória sem limite

**Sintoma.** A revisão da ATV II já tinha apontado "históricos em memória que crescem sem limite". Um cache e uma
auditoria em memória mal feitos repetiriam o problema: o processo cresceria até cair.

**Refatoração.**
- `CacheDecorator`: validade (`ttlMs`) e capacidade máxima, removendo a entrada usada há mais tempo (LRU).
- `AuditoriaDecorator`: guarda só os últimos N registros em memória; o log estruturado recebe todos.

### AP7. Documentação morta (lava flow de documentação)

**Sintoma.** O README da ATV II apontava para `docs/diagrama-refinado.puml`, um arquivo que não existe (README
da ATV2, linha 148). A descrição do `package.json` ainda listava só os padrões da ATV I.

**Refatoração.** Link corrigido para os diagramas reais (`diagrama-atv2.puml` e `diagrama-atv3.puml`) e descrição
atualizada.

---

## 2. Quando um padrão vira anti-padrão (riscos do próprio código)

| Padrão | Como pode virar anti-padrão | Situação no CineBridge |
|---|---|---|
| **Singleton / Global State** (exemplo do enunciado) | Estado escondido em variável global e testes que interferem uns nos outros | **Não usamos Singleton.** Tudo nasce no `config/container.ts` e chega pelo construtor. O cache e a auditoria pertencem às instâncias montadas pela `PoliticaDecoradores` de cada container, então dois containers (ou dois testes) não compartilham estado. As APIs simuladas fazem `structuredClone` dos dados de exemplo, para que um teste não altere o que outro lê. |
| **Factory Method** (exemplo do enunciado) | Hierarquia de fábricas que cresce sem controle, ou produtos sem interface comum | São 4 famílias × 5 produtos (ATV II), e todos os produtos têm interface comum. **Efeito colateral encontrado:** as fábricas criam um recomendador novo a cada chamada (ATV2:`application/fabricas/animacao/FabricaAnimacao.ts:31`), o que deixaria um cache sempre vazio. A `PoliticaDecoradores` reaproveita o recomendador decorado pela chave *nome da estratégia + pilha*. Se surgir um quinto tipo de projeto, a recomendação é revisar se cada tipo precisa mesmo de uma família inteira ou só de um perfil. |
| **Decorator** | A ordem das camadas muda o comportamento sem ninguém perceber | Com o cache **por fora**, a auditoria não registra os acertos de cache; com o cache **por dentro**, registra. A ordem é explícita (a primeira camada da lista fica mais perto do recomendador base) e testada nas duas versões (`tests/integration/decorator.test.ts`). |
| **Composite** | Árvore sem limite vinda de fora (pilha estourada, negação de serviço) | `servicoDeJson` limita a 10 níveis e 500 nós, e a validação acontece no domínio, na fronteira de confiança. |
| **Martelo de ouro** (usar um padrão porque ele existe) | Comprimir dentro de um pipeline em memória | O `CompressaoDecorator` existe porque o enunciado pede, mas a interface `RecomendacaoStrategy` não pode mudar, então o `Map` devolvido não pode ir comprimido. O decorador gera o pacote que de fato trafegaria (gzip), entrega a um `destino` opcional e mede a redução. Na resposta HTTP, o lugar certo para compressão seria o próprio servidor (ex.: `@fastify/compress`), não a estratégia. |

---

## 3. O que a ATV III implementou

| Padrão | Requisito do enunciado | Onde |
|---|---|---|
| **Adapter** | Interfaces `AdaptadorArmazenamento`, `AdaptadorPagamento`, `AdaptadorProfissional` | `application/ports/` |
| | Pelo menos 2 concretos por interface (o diagrama mostra 3; fizemos os 3) | `infrastructure/adaptadores/{armazenamento,pagamento,profissionais}/` |
| | Sistemas externos simulados, um por provedor | `infrastructure/externos/` |
| | `SistemaRecomendacao` recebe os adaptadores no construtor e em `configurarAdaptadores` | `application/observers/SistemaRecomendacao.ts` |
| | Provedor escolhido por configuração | `ARMAZENAMENTO`, `PAGAMENTO`, `FONTE_PROFISSIONAIS` (`config/parametros.ts`) |
| **Composite** | `ServicoProjeto` com `calcularCusto`, `listarSubservicos`, `obterPrazo`, `validar` | `domain/servicos/ServicoProjeto.ts` |
| | `ServicoAtomico` (custo, prazo, papel) e `PacoteServico` (lista de `ServicoProjeto`) | `domain/servicos/` |
| | `Projeto.servicoPrincipal` no lugar da lista de papéis; `calcularCustoTotal` delega | `domain/entities/Projeto.ts` |
| | Validação recursiva: papéis válidos e prazos consistentes | `validar()` em cada nó; o prazo total contra a data de entrega fica em `OrquestradorPadrao.validarRestricoes` |
| | Persistência e API | coluna `servicos` (JSONB, migration `20261101000000_servicos_composite`), campo `servicoPrincipal` no `POST /projetos/recomendacoes`, `custoEstimado` e `prazoServicosDias` na resposta |
| **Decorator** | `RecomendacaoStrategy` inalterada | `application/strategies/RecomendacaoStrategy.ts` (mesmo arquivo da ATV II) |
| | `RecomendadorBase` com a lógica principal | `application/strategies/RecomendadorBase.ts` |
| | `CacheDecorator`, `AuditoriaDecorator`, `CompressaoDecorator` recebendo a estratégia no construtor | `application/strategies/decoradores/` |
| | Combinação em ordens diferentes sem modificar o `SistemaRecomendacao` | `decorar()` e `PoliticaDecoradores` |
| | Pilha definida em tempo de execução (configuração ou preferência do produtor) | `DECORADORES=cache,auditoria,compressao`, `PARAMETROS_JSON` (`decoradores.porProdutor`) e `PUT /produtores/:id/decoradores` |

---

## 4. Pegadinhas do enunciado e como foram resolvidas

1. **Análise de anti-padrões escondida na introdução.** Ela não aparece na lista de tarefas, mas a introdução
   diz que a atividade "consistirá justamente" nela. Resolvido por este documento.
2. **O diagrama empurra para um Objeto Deus.** O diagrama coloca armazenamento, pagamento e cadastro no
   `SistemaRecomendacao`. Seguimos o contrato (injeção e `configurarAdaptadores`), mas deixamos a lógica fora
   da classe (AP1).
3. **O diagrama está cortado.** O texto promete "todas as cardinalidades e tipos", mas a imagem
   (`docs/diagrama-3.png`) termina no meio do `RecomendadorBase`, e Composite e Decorator não aparecem. As duas
   partes foram projetadas a partir do texto e estão em `docs/diagrama-atv3.puml`.
4. **Texto ("pelo menos duas") × diagrama (três por interface).** Implementar os três (`AdaptadorLocal`,
   `AdaptadorPayPal`, `AdaptadorIndeed` além dos citados) atende os dois.
5. **Uma única classe externa por interface no diagrama.** Com um só `ArmazenamentoExterno` para S3 e Google
   Cloud, os dois adaptadores traduziriam a mesma API e o Adapter perderia o sentido. Criamos uma API simulada
   por provedor. As assinaturas do diagrama foram mantidas nas classes correspondentes:
   - `ArmazenamentoExterno` → `ApiGoogleCloudStorageSimulada`;
   - `GatewayPagamento` → `ApiPagSeguroSimulada`;
   - `ApiProfissionalExterna` → `ApiLinkedInSimulada`.

   O `AdaptadorLocal` adapta o próprio disco e o `AdaptadorInterno` adapta o repositório; é por isso que o
   diagrama marca a cardinalidade `0..1`.
6. **Tipos que o diagrama usa e não define** (`Transacao`, `File`). `Transacao` foi definida na
   `ApiPagSeguroSimulada`. `File` é o tipo nativo do Node 24; converter `File` ↔ `Buffer` é justamente o trabalho
   do `AdaptadorGoogleCloud`.
7. **Diagrama síncrono × mundo real assíncrono.** Chamadas a serviços externos em Node.js são sempre
   assíncronas. As portas devolvem `Promise`, e a divergência fica registrada aqui. O mesmo vale para
   `executarRecomendacao`, que já devolvia `Promise<ResultadoRecomendacao>` na ATV II (seção 6.1 da
   `analise-critica.md`).
8. **"Em vez de uma lista simples de papéis" × o resto do sistema.** Trocar a lista quebraria orquestrador,
   ranking, verba por papel, banco e API, e `ServicoAtomico` nem tem peso no texto. Resolvido derivando os papéis
   das folhas (com `peso`, padrão 1). A API continua aceitando `papeisObrigatorios` (convertido em um pacote, com
   custo e prazo "não estimados") e recusa o envio dos dois formatos juntos.
9. **Prazo de um pacote: soma ou máximo?** O enunciado não diz. Etapas em sequência somam e etapas simultâneas
   (`paralelo: true`) usam a mais longa, porque coloração e mixagem acontecem ao mesmo tempo, mas filmagem e
   pós-produção não.
10. **Compressão com interface inalterada.** O `Map` não pode ser devolvido comprimido. Ver o "martelo de ouro"
    na seção 2.
11. **Ordem "cache, auditoria, compressão" × "a auditoria registra todas as chamadas".** Lida como ordem de
    **aplicação** (a primeira camada fica mais perto do recomendador base), essa ordem é coerente: a auditoria
    fica por fora do cache e vê todas as chamadas. Lida ao contrário, contradiz o próprio enunciado. A ordem é
    documentada e testada.
12. **Chave do cache e "projetos similares".** O id do projeto é aleatório, então a chave usa as características
    que as estratégias leem (tipo, gênero, captação, orçamento, prazo, local, papéis e pesos) **mais a lista de
    candidatos**. Sem os candidatos, um profissional rejeitado voltaria pelo cache.
13. **Plataformas: "Ubuntu 24.04.03".** A versão real é 24.04.3. O CI roda em `ubuntu-24.04` (24.04.x) e em
    Windows. Nada no código depende do sistema operacional; o único ponto sensível, o caminho de arquivo do
    `AdaptadorLocal`, usa `node:path` e guarda os ids sempre com `/`.

---

## 5. Evidências

- `npm run typecheck`: sem erros (TypeScript estrito).
- `npm test`: **236 testes passando** (1 pulado: PostgreSQL real, só com `TESTAR_PRISMA=1`). Eram 184 na ATV II.
- Cobertura: 98,4% das instruções e 91,6% dos desvios (mínimo exigido no CI: 80%).
- `npm run smoke` (servidor compilado, API real) verifica também um projeto com `servicoPrincipal` e a pilha de
  decoradores ativa.
- Testes de integração novos:
  - `tests/integration/adapter.test.ts`:
    - o mesmo contrato roda contra os três provedores de cada tipo;
    - a mesma equipe é paga por Stripe, PagSeguro e PayPal só trocando o adaptador injetado no
      `SistemaRecomendacao`, com o mesmo resultado de negócio;
    - os arquivos vão para S3 ou Google Cloud com o mesmo código;
    - a recomendação passa a usar candidatos do LinkedIn trocando só a fonte;
    - estorno automático quando um pagamento é recusado;
    - proteção contra path traversal.
  - `tests/integration/composite.test.ts`: custo e prazo em estruturas de 1 a 4 níveis, sequenciais e
    paralelas; validação recursiva com caminho do erro; prazo dos serviços contra a data de entrega; ida e volta
    do JSON com limites; API.
  - `tests/integration/decorator.test.ts`:
    - o cache reduz o tempo de resposta (recomendador base lento de propósito: 2ª chamada < 1/3 da 1ª, base
      chamado uma vez);
    - a auditoria registra todas as chamadas, inclusive as que falham;
    - a compressão reduz o tamanho (pacote < 60% do original) com ida e volta exata;
    - três ordens diferentes dão o **mesmo resultado** do recomendador sem decoradores;
    - a pilha muda em tempo de execução sem mexer no `SistemaRecomendacao`;
    - preferência do produtor pela API.
- `npm run demo`, seções 6 a 8: árvore de serviços, pilha de decoradores (exemplo: 1302 → 435 bytes) e troca de
  provedores.

---

## 6. Limitações e trade-offs assumidos

- **Pagamento sem idempotência.** Chamar `pagarEquipe` duas vezes paga duas vezes. Em produção seria preciso
  gravar os pagamentos e usar uma chave de idempotência (marcado com `shortcut:` no código). Falhas no meio são
  compensadas com estorno.
- **Profissional externo no banco.** Com `REPOSITORIO=prisma`, uma equipe com alguém vindo do LinkedIn/Indeed não
  grava, porque o membro da equipe referencia a tabela `profissionais`. Faltaria importar o perfil para o
  cadastro interno antes de convidar. Em memória, funciona.
- **Cache pode servir dado antigo** por até `ttlMs` (padrão: 60 s) se o cadastro de um profissional mudar sem
  mudar a lista de candidatos.
- **Preferência do produtor só em memória.** `PUT /produtores/:id/decoradores` some ao reiniciar.
- **Pacote comprimido sem consumidor real.** Ele fica disponível em `ultimoPacote()`/`destino`, mas nenhum
  transporte o envia ainda (seção 2).
- **`AdaptadorLocal` não guarda o tipo do conteúdo** (o disco só guarda os bytes).
- **Sem endpoints REST de arquivos e pagamentos.** Os métodos existem no `SistemaRecomendacao` e estão cobertos
  por testes e pela demo, mas não foram expostos na API.
- **Migration nova não aplicada num PostgreSQL local.** O CI aplica `20261101000000_servicos_composite` no job
  com PostgreSQL 18; nesta máquina foi validada pelo Prisma Client e pelo typecheck.
