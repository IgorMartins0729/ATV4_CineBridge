# Análise crítica do microsserviço de recomendação (ATV I → ATV II)

Este documento analisa o código entregue na ATV I (pasta `ATV1_CineBridge/backend`), aponta onde ele é
**rígido**, **frágil** ou **imóvel** diante dos novos requisitos de negócio e descreve as refatorações feitas
na ATV II com os padrões **Prototype**, **Factory Method** e **Abstract Factory**.

As referências `arquivo:linha` sem prefixo apontam para `ATV1_CineBridge/backend/src`.

---

## 1. Contexto: o que mudou no negócio

Na ATV I o microsserviço tinha **um único modelo de projeto** (`Projeto`), com atributos fixos, e um único
conjunto de regras de validação, recomendação e notificação para todos os projetos.

A ATV II traz um requisito novo. Documentários, animações e peças publicitárias:

- precisam de **atributos diferentes** (tema e entrevistados; técnica e softwares; cliente e veiculação);
- seguem **regras de validação diferentes** (um documentário sem roteirista/pesquisador não faz sentido; uma
  animação 3D sem software de modelagem também não; uma peça publicitária não tem 90 minutos);
- valorizam **competências diferentes** na recomendação (pesquisa; modelagem 3D; acabamento visual);
- pedem **notificações em formatos diferentes** para o produtor.

A pergunta da análise é: **quanto custa, no código da ATV I, acomodar esses tipos?**

---

## 2. Pontos fortes que foram preservados

A análise não parte do zero. Algumas decisões da ATV I já reduziam acoplamento e foram reaproveitadas:

- **Strategy** (`application/strategies/`): o algoritmo de recomendação já era trocável. O perfil ideal de cada
  papel já podia ser configurado (`SimilaridadeCosseno.ts:22`, campo `perfis`), e isso permitiu criar os
  recomendadores por tipo **sem reescrever** o algoritmo de cosseno.
- **Visitor** (`domain/visitors/VisitanteProjeto.ts`): a interface de visitante permitiu criar os validadores
  de cada tipo como novos visitantes, sem tocar nas entidades.
- **Template Method** (`OrquestradorEquipe.orquestrar`): o fluxo fixo e protegido contra sobrescrita manteve o
  orquestrador como o lugar natural para injetar a fábrica.
- **Inversão de dependência** (`application/ports/` + `config/container.ts`): como só o container conhecia as
  classes concretas, as fábricas entraram em um único ponto de montagem.

---

## 3. Pontos de rigidez

> Rigidez: uma mudança pequena exige alterar muitos pontos do código.

### R1. Um único `Projeto` com atributos fixos

`domain/entities/Projeto.ts:13-30` define um único conjunto de propriedades. Para guardar o **tema** de um
documentário seria preciso alterar, ao mesmo tempo:

| Ponto | Arquivo |
|---|---|
| propriedades e construtor | `domain/entities/Projeto.ts` |
| criação a partir da requisição | `application/services/ProjetoService.ts:37` |
| schema de entrada da API | `infrastructure/http/schemas.ts:9-63` |
| resposta da API | `infrastructure/http/apresentadores.ts:44-62` |
| gravação e leitura no banco | `infrastructure/repositories/prisma/ProjetoRepositoryPrisma.ts:36-50` e `:101` |

Além disso, o atributo existiria em **todos** os projetos (um longa de ficção teria um campo "tema de
documentário" vazio). É o sintoma clássico de *shotgun surgery*.

### R2. O "tipo" do projeto era só um enum espalhado pelo código

`TipoCaptacao` (`domain/enums/TipoCaptacao.ts`) era a única informação de tipo, e era consultada diretamente
em vários lugares:

- `SimilaridadeCosseno.ts:65`: `COMPETENCIA_POR_CAPTACAO[projeto.getTipoCaptacao()]`
- `FiltragemColaborativa.ts:52`: `projeto.getTipoCaptacao()`
- `domain/catalogo/perfisCompetencia.ts:18`: tabela por tipo
- `infrastructure/dados/geradorProfissionais.ts:24`: lista fixa dos tipos
- `infrastructure/http/schemas.ts:40` e o `enum TipoCaptacao` do Prisma

Um tipo novo (ex.: **publicitário**) exigiria editar todos esses pontos. Para dar a ele um comportamento
próprio, o caminho natural seria acrescentar `if (tipo === ...)` dentro das estratégias e validadores.

### R3. Um único orquestrador para todos os projetos

`config/container.ts:86` criava **um** `OrquestradorPadrao`, e o `SistemaRecomendacao` guardava essa única
instância. Não havia como o orquestrador validar uma animação de um jeito e um documentário de outro, a não
ser com condicionais por tipo dentro de `OrquestradorPadrao.validarRestricoes` (`OrquestradorPadrao.ts:19`).

---

## 4. Pontos de fragilidade

> Fragilidade: corrigir ou ajustar uma parte quebra outra que não tem relação aparente.

### F1. Perfil de recomendação global

`SimilaridadeCosseno` usava por padrão `PERFIS_POR_PAPEL` (`SimilaridadeCosseno.ts:29`), um perfil ideal
**único** para cada papel. Para fazer o recomendador de animação valorizar modelagem 3D, a forma mais direta
seria editar essa tabela. Isso **mudaria silenciosamente o ranking de todos os documentários e ficções**. O
mesmo arquivo ainda alimenta o gerador de dados (`geradorProfissionais.ts:74`), o que espalharia o efeito
para a massa de teste.

### F2. Validação em lugares diferentes, sem dono por tipo

As regras de validação ficavam divididas entre:

- o construtor de `Projeto` (`Projeto.ts:47-62`): invariantes;
- `OrquestradorPadrao.validarRestricoes` (`OrquestradorPadrao.ts:19-32`): prazo, equipe e verba;
- o visitante `ValidadorConsistencia` (`ValidadorConsistencia.ts:19-47`): equipe completa e orçamento;
- o schema HTTP (`schemas.ts`): formato da entrada.

Uma regra como "documentário precisa de roteirista" não tinha um lugar óbvio. Colocada só no schema HTTP,
ela não valeria na **reavaliação** (`GestaoEquipeService.atualizarRestricoes`), que não passa pela API.
Colocada no orquestrador, viraria um `if` por tipo. Os dois caminhos criam inconsistência entre fluxos.

### F3. Notificadores com texto fixo

`NotificadorEmail.ts:20` e `NotificadorInterno.ts:22` montam as mensagens em um `switch (evento.tipo)` com
textos fixos. Um formato específico por tipo de projeto exigiria um segundo nível de condicionais dentro de
cada `case`. Qualquer ajuste no texto de um tipo correria o risco de alterar o dos outros.

### F4. Nada garantia que os objetos de um projeto combinassem

Estratégia, validador e notificador eram escolhidos de forma independente. Nada impedia usar o validador
pensado para animação em um documentário. Esse tipo de erro só apareceria em produção.

---

## 5. Pontos de imobilidade

> Imobilidade: não dá para reaproveitar uma parte do sistema em outro contexto sem arrastar o resto.

### I1. Criar um projeto "a partir de um modelo" era impossível

`Projeto` não tinha como ser copiado. Para oferecer ao produtor um **modelo pré-configurado** (por exemplo,
"documentário com diretor, roteirista, fotografia, som e edição") seria preciso remontar todas as
propriedades à mão. Essa lógica de criação já aparecia repetida em **quatro lugares** de produção e testes:

- `ProjetoService.ts:37`
- `ProjetoRepositoryPrisma.ts:101`
- `tests/fixtures/fabricas.ts`
- `scripts/demo.ts`

`Equipe` também não podia ser copiada.

### I2. O motor de recomendação não podia ser reaproveitado com outro perfil sem duplicação

Embora `SimilaridadeCosseno` aceitasse `perfis` por configuração, não havia um lugar para guardar "o perfil do
documentário" ou "o perfil da animação". Reaproveitar o algoritmo para um tipo novo exigiria copiar a
configuração em cada ponto de uso.

---

## 6. Refatorações aplicadas na ATV II

As referências desta seção apontam para `backend/src` da ATV II.

| Problema | Padrão | Solução | Arquivos |
|---|---|---|---|
| R1, I1 | **Prototype** | `Projeto.clonar(ajustes)` faz cópia profunda (papéis, localização, equipe e rejeitados). Cada subclasse (`ProjetoDocumentario`, `ProjetoAnimacao`, `ProjetoPublicitario`) acrescenta só os próprios atributos e sobrescreve `clonar`. `Equipe.clonar()` copia os membros. | `domain/entities/Projeto.ts`, `domain/entities/projetos/*`, `domain/entities/Equipe.ts` |
| I1 | **Prototype** (registro) | Modelos pré-configurados por tipo; o registro sempre entrega um clone, então o modelo original nunca é alterado. | `application/prototipos/catalogoPrototipos.ts`, `RegistroPrototipos.ts` |
| R2, F2, F3, F4 | **Abstract Factory** | `FabricaProjeto` define a família (projeto, validador, recomendador, notificador). As fábricas `FabricaDocumentario`, `FabricaAnimacao`, `FabricaPublicitario` e `FabricaGeral` produzem objetos que combinam entre si. | `application/fabricas/FabricaProjeto.ts`, `application/fabricas/*/` |
| R1, I1 | **Factory Method** | Cada `criarProjeto` clona o protótipo do tipo; `criarValidador`, `criarRecomendador` e `criarNotificador` deixam a subclasse decidir a classe concreta. | `application/fabricas/*/Fabrica*.ts` |
| F1, I2 | Factory Method + Strategy | `RecomendadorPorPerfil` reaproveita o cosseno com o perfil do tipo, sem tocar no perfil global. | `application/fabricas/base/RecomendadorPorPerfil.ts` |
| F2 | Factory Method + Visitor | Cada tipo tem seu validador, que é um visitante. `visitarProjeto` aplica as regras do tipo e `visitarProfissional` diz se o profissional tem experiência no tipo. Como o orquestrador sempre chama o validador, a regra vale em **todos** os fluxos (API, substituição e reavaliação). | `application/fabricas/base/ValidadorTipoProjeto.ts` |
| F3 | Factory Method + Observer | Cada tipo tem seu notificador (um `Observador`), com o resumo no formato do tipo. Os observadores gerais da ATV I continuam iguais. | `application/fabricas/base/NotificadorTipoProjeto.ts` |
| R3 | Injeção da fábrica | `OrquestradorEquipe` recebe a `FabricaProjeto` no construtor e não tem nenhuma condicional por tipo. | `application/orquestrador/OrquestradorEquipe.ts` |
| R3 | Seleção por tipo | `SistemaRecomendacao` identifica o tipo (`RegistroFabricas.paraProjeto`), monta o orquestrador com a fábrica certa e chama o notificador do tipo. | `application/observers/SistemaRecomendacao.ts`, `application/fabricas/RegistroFabricas.ts` |
| F4 | Abstract Factory | Cada validador confere se o projeto é da classe da sua família. Usar a fábrica de documentário em um projeto de animação vira um erro de validação imediato. | `ValidadorTipoProjeto.visitarProjeto` |

### Modelos pré-configurados e relatório por tipo

- **Modelos (Prototype).** O registro de protótipos traz sete modelos com descrição: os quatro principais e
  três variações (`documentario-curta`, `animacao-stop-motion`, `publicidade-tv`). Cada variação é um clone
  ajustado do modelo principal do seu tipo. `GET /modelos` lista os modelos (com filtro por tipo).
  No `POST /projetos/recomendacoes`, o campo `modelo` escolhe qual clonar, e o tipo pode ser deduzido a
  partir dele. A fábrica recusa um modelo de outro tipo com erro 400.
- **Relatório (Factory Method).** As fábricas ganharam um quinto produto, `criarGeradorRelatorio()`. O
  enunciado cita como exemplo o "gerador de relatório com métricas de eficiência de renderização" para
  animação. Cada tipo tem uma seção própria no relatório:
  - **documentário:** tema, entrevistados e experiência documental da equipe;
  - **animação:** quadros, horas de render estimadas e ganho de eficiência pela experiência da equipe em 3D;
  - **publicidade:** cliente, veiculação e custo por segundo de peça.
- **Consistência do tipo no relatório.** `GET /projetos/:id/relatorio` passou a usar o validador da fábrica.
  Por isso as regras do tipo também aparecem ali, e não só na orquestração.

### Ordem de escolha do recomendador

1. Estratégia escolhida pelo produtor no projeto.
2. Estratégia definida no sistema.
3. `regras-orcamento`, se o orçamento estiver abaixo do limite (comportamento da ATV I).
4. Recomendador da fábrica do tipo.

Assim a escolha explícita do produtor continua valendo, e o tipo de projeto só decide quando ninguém decidiu.

### Compatibilidade com a ATV I

O tipo `GERAL` representa o projeto da ATV I. A `FabricaGeral` usa a estratégia padrão de antes, não tem
regras extras e aceita qualquer profissional. Os comportamentos verificados pelos testes da ATV I continuam
valendo. Os testes do orquestrador e das estratégias foram adaptados às novas assinaturas (seção 6.1), mas
verificam as mesmas regras.

### 6.1 Alinhamento com as assinaturas do diagrama do professor

Na ATV I as assinaturas tinham sido "refinadas" e se afastaram do diagrama do enunciado. Na ATV II elas
voltaram a seguir o diagrama:

| Elemento | Diagrama | ATV I | ATV II |
|---|---|---|---|
| `RecomendacaoStrategy.recomendar` | `(projeto, profissionais): Map<Papel, Profissional[]>` | `(projeto, profissionais, papeis?): Ranking` | igual ao diagrama |
| `OrquestradorEquipe.orquestrar` | `(projeto, estrategia): Equipe` | `(projeto, profissionais, estrategia, opcoes): ResultadoOrquestracao` | igual ao diagrama (+ `opcoes` opcional) |
| `validarRestricoes` | `(projeto): boolean` | `: string[]` | igual ao diagrama |
| `normalizarDados` | `(projeto, profissionais: Profissional[]): Profissional[]` | igual | igual |
| `posProcessar` | `(recomendacoes: Map<Papel, Profissional[]>): Map<Papel, Profissional[]>` | `(projeto, ranking): Ranking` | igual ao diagrama |
| `FabricaProjeto` | `criarProjeto(dados)`, `criarValidador(): VisitanteProjeto`, `criarRecomendador()`, `criarNotificador(): Observador` | n/a | igual ao diagrama (`dados` tipado como `DadosProjeto`) |
| `Projeto.clonar` | `(): Projeto` | n/a | igual (+ `ajustes` opcional) |

Para alinhar sem perder funcionalidade, foram tomadas estas decisões:

- **Pontuação dentro do Map.** A estratégia devolve `RecomendacoesPorPapel`, que é um
  `Map<Papel, Profissional[]>` e também guarda a pontuação de cada candidato. Assim a API e a auditoria
  continuam mostrando as notas. Uma estratégia externa que devolva um `Map` simples também funciona: a nota
  passa a vir da posição na lista.
- **De onde vêm os candidatos.** Como `orquestrar` não recebe mais os profissionais, eles entram pelo
  construtor, ao lado da fábrica. O `SistemaRecomendacao` busca os candidatos (de forma assíncrona, com
  fallback) e cria **um orquestrador por rodada**. Com isso `orquestrar` continua síncrono e devolve `Equipe`.
- **A melhor equipe é o retorno.** As demais sugestões, o ranking com notas e os papéis sem candidatos ficam
  em `getResultado()`. Isso não gera conflito entre requisições, porque cada rodada tem o seu orquestrador.
- **`validarRestricoes` retorna `boolean`.** O motivo da falha é informado com `reportarProblema()`, que vai
  na mensagem de erro (HTTP 422).
- **`posProcessar` não recebe o projeto.** Quando precisa da nota de um candidato, usa `pontuacaoDe()`.
- **O que continua diferente.** `SistemaRecomendacao.executarRecomendacao` ainda retorna
  `Promise<ResultadoRecomendacao>`, e não `Equipe`. Ele é assíncrono (consulta o repositório) e é um objeto
  único, compartilhado por todas as requisições: guardar o "último resultado" nele misturaria requisições
  simultâneas.

---

## 7. Resultado: quanto custa um tipo novo agora

| Para acrescentar "realidade virtual" | ATV I | ATV II |
|---|---|---|
| Atributos próprios | alterar `Projeto` e mais 4 arquivos (R1) | criar uma subclasse de `Projeto` |
| Regras de validação | `if` no orquestrador ou no schema (R3, F2) | criar um validador |
| Perfil de recomendação | editar o perfil global e afetar todos (F1) | criar um recomendador com o perfil do tipo |
| Formato de notificação | `if` dentro dos `switch` (F3) | criar um notificador |
| Orquestrador | alterar | **nenhuma linha** |
| Registro | n/a | uma linha em `config/container.ts` |

O teste `tests/integration/fabricas.test.ts` ("um tipo novo (realidade virtual)…") demonstra isso: ele cria
um tipo e uma fábrica **dentro do próprio teste**, registra a fábrica e executa a recomendação completa,
sem alterar nenhum arquivo de `src/`.

### Evidências

- `npm run typecheck` sem erros (TypeScript em modo estrito).
- **184 testes passando** (1 pulado: o teste com PostgreSQL real, que só roda com `TESTAR_PRISMA=1`).
- Cobertura: 99,35% das instruções e 94,03% dos desvios (mínimo exigido: 80%).
- Testes novos:
  - `tests/unit/prototipos/prototype.test.ts`: cópia profunda, independência entre clone e original, ajustes
    e restauração da subclasse certa;
  - `tests/integration/fabricas.test.ts`: as quatro famílias, as regras de cada tipo, recusa de mistura de
    famílias, prioridade da estratégia escolhida, notificação por tipo e o tipo novo sem alterar o orquestrador;
  - `tests/integration/api.test.ts`: criação de projetos por tipo via REST.

### 7.1 Fragilidades corrigidas nos casos de uso (encontradas em revisão de código)

A revisão de código da ATV II encontrou quatro casos de **fragilidade** no sentido da seção 4: uma falha
no meio de uma operação deixava o projeto num estado inconsistente. Todos estavam em
`GestaoEquipeService` e na rota de criação, e vinham da ATV I.

| # | Problema | Efeito | Correção |
|---|---|---|---|
| 1 | `trocar()` removia o membro, bloqueava o profissional e cancelava o convite **antes** da nova rodada, que ainda podia falhar | Substituição recusada (candidato inválido, prazo vencido) deixava o papel vago e o profissional bloqueado | Primeiro roda a recomendação, com o membro atual só excluído da rodada. O projeto só é alterado depois que tudo deu certo |
| 2 | Substituir usava `rejeitarMembro` | Uma simples troca bloqueava o profissional para sempre e, sem alternativa, deixava o papel vago | Só rejeição e recusa de convite bloqueiam. Substituir sem alternativa mantém o membro atual |
| 3 | `PATCH /restricoes` gravava o novo prazo/orçamento antes da reavaliação | Um prazo no passado ficava salvo e travava as recomendações seguintes | Prazo no passado é recusado (422). A reavaliação roda em um **clone** do projeto (Prototype) e só então os valores são aplicados e gravados |
| 4 | `POST /projetos/recomendacoes` gravava o projeto antes de recomendar | Um 422 deixava no banco um projeto cujo id o cliente não recebia | O projeto é montado pela fábrica, recomendado e só então gravado (`ProjetoService.montar` + `GestaoEquipeService.recomendarNovoProjeto`) |

A regra comum agora é: **executar o que pode falhar antes e alterar o projeto real depois**. Quando a
operação precisa de valores novos, ela é simulada em um clone do projeto. Cada correção tem testes de
regressão em `tests/unit/services/gestaoEquipe.test.ts` e `tests/integration/api.test.ts`.

A revisão também apontou problemas que **não** foram corrigidos nesta etapa:
- concorrência com o Prisma: duas confirmações simultâneas regravam a equipe inteira, e dois cliques em
  "aceitar" podem criar dois convites (resolver exige versão otimista ou transação com bloqueio);
- erros dos observadores de convite são só registrados em log, sem nova tentativa;
- históricos em memória que crescem sem limite;
- regra de proximidade duplicada em dois lugares.

---

## 8. Limitações e trade-offs assumidos

Os padrões não são gratuitos. Estes custos foram aceitos conscientemente:

- **Mais classes.** Cada tipo traz quatro classes (fábrica, validador, recomendador e notificador). As classes
  base (`ValidadorTipoProjeto`, `RecomendadorPorPerfil`, `NotificadorTipoProjeto`) concentram a lógica comum,
  e cada classe concreta tem poucas linhas.
- **A persistência ainda conhece os tipos.** Para gravar e ler do banco, um tipo novo também precisa de:
  - um valor no enum `TipoProjeto`;
  - uma linha em `domain/entities/projetos/restaurarProjeto.ts` (um mapa, sem `if`);
  - um valor no enum do Prisma, com migration.

  O orquestrador e os serviços não mudam. O teste de "realidade virtual" funciona porque usa o repositório
  em memória.
- **Atributos específicos em JSON.** No banco eles ficam em uma coluna `especificos` (JSONB). Isso evita uma
  tabela por tipo, mas a validação desses campos fica no domínio (`lerEspecificos` de cada subclasse), não no
  banco.
- **`instanceof` nos validadores.** É uma verificação de coerência da família, não um desvio de comportamento
  por tipo. A interface `VisitanteProjeto` do diagrama tem só `visitarProjeto`/`visitarProfissional`, então o
  validador precisa confirmar a classe concreta para ler os atributos específicos.
- **Migration ainda não aplicada em um banco real.** O CI aplica a migration num PostgreSQL de verdade, mas ainda não
  rodou, porque o repositório não foi publicado. A migration `20261018000000_tipos_projeto` foi gerada à mão e
  validada pelo Prisma Client e pelo typecheck, mas não foi aplicada em um PostgreSQL nesta etapa.

---

## 9. Compatibilidade de plataforma

O código não usa nada específico de sistema operacional:
- os caminhos são resolvidos pelos imports do Node;
- os scripts do `package.json` são os mesmos em Windows e Linux;
- todos os nomes de arquivo nos imports conferem maiúsculas e minúsculas (verificado por script), o que
  evita o erro clássico de funcionar no Windows e quebrar no Ubuntu.

O arquivo `.gitattributes` fixa os finais de linha em LF, para que a diferença CRLF/LF do Windows não
altere arquivos entre as plataformas.

A verificação fica automatizada em `.github/workflows/ci.yml` (GitHub Actions). A cada push o CI roda nos
dois sistemas:
- em **Ubuntu 24.04** e **Windows**: typecheck, testes com cobertura mínima de 80%, build e smoke test;
- o smoke test (`npm run smoke`) sobe o servidor compilado e chama `/health`, `/modelos`, a criação de
  projetos dos quatro tipos e o relatório;
- um job separado sobe um **PostgreSQL 18**, aplica as migrations (incluindo a `tipos_projeto`) e roda os
  testes dos repositórios Prisma.

Localmente, testes e smoke test foram executados no Windows 11 com Node 24. A execução no Ubuntu fica a
cargo do CI e só acontece depois que o repositório for publicado no GitHub.
