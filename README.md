# CineBridge: plataforma de recomendação e orquestração de equipes audiovisuais

## ATV IV: containers, microsserviços e RabbitMQ

A ATV IV parte do código da ATV III. O sistema vira **4 microsserviços em containers**, que conversam pelo
**RabbitMQ** e têm **um PostgreSQL cada**, orquestrados pelo [`docker-compose.yml`](docker-compose.yml) da raiz.
As pegadinhas do enunciado e as decisões tomadas estão em [`docs/decisoes-atv4.md`](docs/decisoes-atv4.md).

| Container | Porta | Papel | Banco (porta no host) |
|---|---|---|---|
| `cinebridge-api` | 3000 | recomendação e orquestração (ATV I a III); único ponto de entrada público | `recomendacoes-db` (5434) |
| `cinebridge-profissionais` | 3001 | cadastro e consulta de profissionais | `profissionais-db` (5432) |
| `cinebridge-projetos` | 3002 | fonte de verdade de projetos, equipes e convites | `projetos-db` (5433) |
| `cinebridge-notificacoes` | 3003 | e-mails e mensagens internas | `notificacoes-db` (5435) |
| `cinebridge-mq` | 5672 / 15672 | RabbitMQ (painel em http://localhost:15672, `guest/guest`) | |

| Fila | De → para | Tipo |
|---|---|---|
| `consulta-profissionais` | api → profissionais | RPC (resposta numa fila de retorno exclusiva `respostas.<uuid>`) |
| `comandos-projetos` | api → projetos | RPC: gravar/ler projetos e convites |
| `eventos-projetos` | projetos → notificações | eventos `PROJETO_CRIADO`, `PROJETO_ATUALIZADO`, `PROJETO_FINALIZADO` (Observer) |
| `envio-notificacoes` | api → notificações | e-mails e mensagens internas dos observadores da api (recomendação, convite aceito...) |
| `consulta-notificacoes` | api → notificações | RPC: leitura da caixa de mensagens |

As regras de negócio das ATV I a III **não mudaram**. Mudaram só os adaptadores ligados no `config/container.ts`:
os repositórios de profissionais, projetos e convites e os canais de notificação passaram a falar pela fila.

### Subir com Docker

```bash
docker compose up -d --build --wait   # 9 containers; --wait espera todos os healthchecks
docker compose ps                     # todos "healthy"
docker compose logs -f                # logs de todos os serviços
cd backend && npm ci && npm run e2e   # etapa 7 automatizada: fluxo completo + filas no painel do RabbitMQ
docker compose down                   # (-v apaga os dados)
```

**Sem Docker na máquina** (ex.: notebook corporativo sem permissão de instalação):
- **GitHub Actions:** todo push roda o job `docker` do `.github/workflows/ci.yml`, que sobe os 9 containers num
  Ubuntu 24.04 e roda o `npm run e2e`. Os logs de cada container ficam no próprio job.
- **GitHub Codespaces:** no repositório, *Code > Codespaces > Create codespace* abre um Ubuntu 24.04 com Docker
  no navegador (`.devcontainer/`). Lá, os mesmos comandos acima funcionam, e as portas 3000 e 15672 aparecem na aba *Ports*.
- **Sem container nenhum:** `cd backend && npm run dev` roda a API como monolito em memória (modo da ATV III), e
  `npm test` inclui `tests/integration/microsservicos.test.ts`, que sobe os quatro serviços no mesmo processo
  ligados por um broker em memória.

---

## ATV III: anti-padrões, Adapter, Composite e Decorator

A ATV III parte do código da ATV II. Ela tem duas entregas:
- a **análise de anti-padrões** do código, em [`docs/analise-antipadroes.md`](docs/analise-antipadroes.md), que
  também registra as pegadinhas do enunciado e as decisões tomadas;
- os três **padrões estruturais**, desenhados em [`docs/diagrama-atv3.puml`](docs/diagrama-atv3.puml). O diagrama
  do enunciado, `docs/diagrama-3.png`, é cortado à direita.

| Padrão | Para quê | Onde |
|---|---|---|
| **Adapter** | Conectar o núcleo a armazenamento (S3, Google Cloud, disco local), pagamento (Stripe, PagSeguro, PayPal) e cadastros de profissionais (interno, LinkedIn, Indeed) | portas em `application/ports/Adaptador*.ts`, adaptadores em `infrastructure/adaptadores/`, APIs simuladas em `infrastructure/externos/` |
| **Composite** | Projeto como hierarquia de serviços: pacotes que contêm pacotes e serviços atômicos | `domain/servicos/` e `Projeto.servicoPrincipal` |
| **Decorator** | Cache, auditoria e compressão em volta de qualquer recomendador, em qualquer ordem | `application/strategies/RecomendadorBase.ts` e `application/strategies/decoradores/` |

- **Adapter:**
  - `SistemaRecomendacao` recebe os adaptadores no construtor e em `configurarAdaptadores(...)`;
  - trocar o provedor não muda a lógica de negócio (veja `tests/integration/adapter.test.ts`);
  - o provedor também pode ser escolhido por variável de ambiente.
- **Composite:**
  - `Projeto.calcularCustoTotal()` delega ao serviço principal;
  - os papéis do projeto são derivados das folhas da árvore;
  - etapas em sequência somam prazo, e etapas simultâneas (`paralelo: true`) contam só a mais longa;
  - o prazo total precisa caber até a data de entrega.
- **Decorator:**
  - a pilha padrão é `cache -> auditoria -> compressao`, aplicada nessa ordem (a primeira camada fica mais perto
    do recomendador);
  - é configurável por `DECORADORES` ou pela preferência de cada produtor;
  - mudar a pilha não exige mudar o `SistemaRecomendacao`.

Na API:
- `POST /projetos/recomendacoes` aceita `servicoPrincipal` (a árvore). A lista antiga `papeisObrigatorios` continua
  aceita, mas não os dois juntos. A resposta traz `custoEstimado`, `prazoServicosDias` e `servicoPrincipal`.
- `GET /modelos` mostra a árvore de serviços de cada modelo.
- `GET /estrategias` mostra a pilha de decoradores e os provedores em uso.
- `PUT /produtores/:id/decoradores` define a pilha do produtor, por exemplo `{ "decoradores": ["auditoria", "cache"] }`.

```bash
curl -X POST http://localhost:3000/projetos/recomendacoes -H "Content-Type: application/json" -d '{
  "titulo": "Curta com pós-produção",
  "produtor": { "id": "prod-1", "nome": "Paula Lima", "email": "paula@produtora.com" },
  "orcamento": 300000, "prazo": "2027-06-30", "localizacao": { "cidade": "Recife", "uf": "PE" },
  "servicoPrincipal": { "nome": "Curta", "subservicos": [
    { "nome": "Direção", "papel": "DIRETOR", "custo": 40000, "prazo": 20, "peso": 3 },
    { "nome": "Pós-produção", "paralelo": true, "subservicos": [
      { "nome": "Edição", "papel": "EDITOR", "custo": 10000, "prazo": 15 },
      { "nome": "Mixagem", "papel": "SONOPLASTA", "custo": 6000, "prazo": 10 } ] } ] }
}'
```

Variáveis novas (todas opcionais):

| Variável | Valores | Padrão |
|---|---|---|
| `DECORADORES` | lista separada por vírgula de `cache`, `auditoria`, `compressao` (vazio = nenhum) | `cache,auditoria,compressao` |
| `ARMAZENAMENTO` | `s3`, `google-cloud`, `local` | `s3` |
| `DIRETORIO_ARQUIVOS` | pasta do provedor `local` | `arquivos` |
| `PAGAMENTO` | `stripe`, `pagseguro`, `paypal` | `stripe` |
| `FONTE_PROFISSIONAIS` | `interno`, `linkedin`, `indeed` | `interno` |

Os provedores externos são **simulados em memória** (exceto `local`, que grava em disco), como pede o enunciado.

---

## ATV II: Prototype, Factory Method e Abstract Factory

A ATV II parte do código da ATV I e acrescenta tipos de projeto (documentário, animação e publicitário),
cada um com o seu modelo, validador, recomendador e notificador.

| Padrão | Onde |
|---|---|
| **Prototype** | `Projeto.clonar()` e as subclasses em `domain/entities/projetos/` (cópia profunda). Os modelos pré-configurados ficam em `application/prototipos/` |
| **Factory Method** | métodos `criarProjeto`, `criarValidador`, `criarRecomendador` e `criarNotificador` de cada fábrica concreta |
| **Abstract Factory** | `application/fabricas/FabricaProjeto.ts` e as famílias `geral/`, `documentario/`, `animacao/` e `publicitario/` |

- `OrquestradorEquipe` recebe a fábrica no construtor e não tem nenhum `if` por tipo de projeto.
- `SistemaRecomendacao` identifica o tipo do projeto (`RegistroFabricas`) e monta a orquestração com a fábrica certa.
- Para criar um tipo novo, basta uma subclasse de `Projeto`, uma fábrica e o registro dela em `config/container.ts`
  (veja o teste "realidade virtual" em `tests/integration/fabricas.test.ts`).

CI: `.github/workflows/ci.yml` roda typecheck, testes, build e smoke test em **Ubuntu 24.04 e Windows**, as
migrations e os testes dos repositórios num PostgreSQL e (ATV IV) o `docker compose` completo com teste ponta a ponta.

Na API:
- `GET /modelos` lista os modelos pré-configurados. Use `?tipoProjeto=ANIMACAO` para filtrar por tipo.
  São eles: `geral`, `documentario`, `documentario-curta`, `animacao`, `animacao-stop-motion`, `publicitario`
  e `publicidade-tv`.
- `POST /projetos/recomendacoes` aceita `modelo` (ou `tipoProjeto`) e `especificos`. O que não for enviado
  (papéis, gênero, duração) vem do modelo.
- `GET /projetos/:id/relatorio` usa o validador e o relatório da fábrica do tipo. A animação, por exemplo,
  traz as métricas de renderização.

```bash
curl -X POST http://localhost:3000/projetos/recomendacoes -H "Content-Type: application/json" -d '{
  "modelo": "animacao-stop-motion",
  "especificos": { "softwares": ["Dragonframe"] },
  "titulo": "Robôs de Papel",
  "produtor": { "id": "prod-1", "nome": "Paula Lima", "email": "paula@produtora.com" },
  "orcamento": 400000, "prazo": "2027-06-30", "localizacao": { "cidade": "Recife", "uf": "PE" }
}'
```

---

Atividade prática ATV I. O serviço recebe um projeto audiovisual (gênero, duração, orçamento,
data de entrega, tipo de captação, localização e papéis obrigatórios com peso), consulta o cadastro de
profissionais, **ranqueia os candidatos por papel** respeitando orçamento e prazo e **monta uma ou mais
sugestões de equipe**. Depois acompanha os ajustes do produtor (aceitar, rejeitar, substituir, reavaliar),
os convites aos profissionais e, quando todos confirmam, **registra a equipe e dispara eventos** para os
microsserviços de gerenciamento de projetos e financeiro.

Stack: **Node.js 24 LTS · TypeScript (strict) · Fastify · Prisma · PostgreSQL · RabbitMQ (amqplib) · Docker · Vitest**.

---

## Como rodar

Pré-requisito: Node.js 24 ou superior (`node -v`). Funciona igual no Windows 10+ e no Ubuntu 24.04+.

```bash
cd backend
npm install          # também gera o Prisma Client
npm run dev          # http://localhost:3000 com 10.000 profissionais fictícios em memória
```

Não precisa de banco para rodar nem para testar: sem `RABBITMQ_URL`, a API roda **em memória**, num processo só.
Com PostgreSQL e RabbitMQ, a plataforma roda pelo Docker (veja a seção da ATV IV). Cada serviço aplica as próprias
migrations (`prisma/<servico>/migrations`) ao subir, e o `cinebridge-profissionais` gera 2.000 profissionais
fictícios se o banco estiver vazio (`PROFISSIONAIS_SEED`).

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor em modo desenvolvimento (recarrega ao salvar) |
| `npm run build` / `npm start` | Compila para `dist/` e executa a versão compilada |
| `npm test` | Testes unitários e de integração |
| `npm run test:coverage` | Testes + relatório de cobertura (`coverage/index.html`) |
| `npm run demo` | Demonstração dos padrões das ATV I, II e III no terminal |
| `npm run carga` | Teste de carga (10 mil profissionais, 100 conexões simultâneas) |
| `npm run smoke` | Sobe o servidor compilado (`npm run build` antes) e testa a API real nos 4 tipos |
| `npm run typecheck` | Verificação de tipos de todo o projeto |
| `npm run e2e` | Com o `docker compose` no ar, testa o fluxo completo pelos containers (ATV IV) |

---

## Endpoints REST

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/projetos/recomendacoes` | **Principal:** recebe o projeto, aplica a estratégia e retorna a equipe recomendada |
| `GET` | `/projetos/:id` | Projeto e equipe atual |
| `POST` | `/projetos/:id/recomendacoes` | Nova recomendação completa (opcional: `{ "estrategia": "..." }`) |
| `POST` | `/projetos/:id/membros/:papel/aceitar` | Produtor aceita o sugerido e o convite é enviado |
| `POST` | `/projetos/:id/membros/:papel/rejeitar` | Rejeita e faz nova rodada **só para esse papel** |
| `POST` | `/projetos/:id/membros/:papel/substituir` | Substitui (opcional: `{ "profissionalId": "..." }`) |
| `PATCH` | `/projetos/:id/restricoes` | Altera orçamento/prazo; se a mudança for significativa, reavalia a equipe toda |
| `GET` | `/projetos/:id/convites` | Convites do projeto |
| `GET` | `/projetos/:id/relatorio` | Resultado dos 3 visitantes (consistência, compatibilidade e relatório) |
| `GET` / `POST` | `/convites/:id` e `/convites/:id/resposta` | Profissional aceita ou recusa: `{ "aceito": true }` |
| `GET` | `/estrategias`, `/health`, `/auditoria`, `/mensagens/:destinatarioId` | Consultas de apoio |

Nos outros serviços (ATV IV): `GET /health` em todos (banco + RabbitMQ; 503 se algum cair),
`GET http://localhost:3002/projetos/:id` (projeto como gravado no `projetos-db`) e
`GET http://localhost:3003/notificacoes/:destinatarioId` (mensagens internas entregues).

Exemplo:

```bash
curl -X POST http://localhost:3000/projetos/recomendacoes -H "Content-Type: application/json" -d '{
  "titulo": "Vozes do Sertão",
  "produtor": { "id": "prod-1", "nome": "Paula Lima", "email": "paula@produtora.com" },
  "genero": "drama", "duracao": 95, "orcamento": 180000, "prazo": "2027-06-30",
  "tipoCaptacao": "FICCAO", "localizacao": { "cidade": "Recife", "uf": "PE" },
  "papeisObrigatorios": [ { "papel": "DIRETOR", "peso": 3 }, { "papel": "EDITOR", "peso": 1 } ],
  "estrategia": "similaridade-cosseno"
}'
```

Erros: `400` (entrada inválida), `404` (não encontrado), `409` (conflito, ex.: equipe já formada),
`422` (projeto não atende às restrições, ex.: data de entrega no passado).

---

## Arquitetura

Camadas com **inversão de dependência**: `domain` e `application` só conhecem interfaces (`application/ports`).
As implementações concretas ficam em `infrastructure` e são ligadas em um único lugar,
`config/container.ts` (composition root, com **injeção de dependências explícita** pelo construtor).

```
backend/src
├── domain/            entidades, enums, value objects, erros, interface do Visitor; servicos/ = Composite (ATV III)
├── application/
│   ├── ports/         interfaces: repositórios, EventBus, logger, canais de notificação
│   ├── strategies/    Strategy; decoradores/ = Decorator (ATV III)
│   ├── orquestrador/  Template Method
│   ├── observers/     Observer (SistemaRecomendacao = sujeito)
│   ├── visitors/      Visitor
│   └── services/      casos de uso (projeto, equipe, convites) e tolerância a falhas
├── infrastructure/    Fastify, Prisma, memória, EventEmitter, pino; adaptadores/ + externos/ = Adapter (ATV III)
│   ├── mensageria/    RabbitMQ (amqplib) e broker em memória para testes (ATV IV)
│   ├── remotos/       adaptadores que falam pela fila + os atendentes de cada fila (ATV IV)
│   └── serializacao/  formato JSON das entidades que cruzam serviços (ATV IV)
├── servicos/          entrada de cada microsserviço: profissionais, projetos, notificacoes; api = modo distribuído
├── config/            container (DI) e parâmetros do algoritmo
└── server.ts          entrada do cinebridge-api
backend/prisma/<servico>/  um schema e uma pasta de migrations por banco
backend/docker/            um Dockerfile e um .env por microsserviço
```



