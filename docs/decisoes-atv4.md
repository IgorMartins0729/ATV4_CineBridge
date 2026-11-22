# ATV IV: decisões e pegadinhas do enunciado

O enunciado (`docs/atv4.pdf`) e o diagrama de implantação (`docs/diagrama-4.png`) têm pontos que, seguidos ao pé da
letra, quebram o sistema ou contradizem o próprio texto. Abaixo, cada um, o que foi feito e por quê.

## 1. Divergências que quebrariam o sistema

| # | O enunciado diz | Problema | O que foi feito |
|---|---|---|---|
| 1 | Imagem base `node:18-alpine` | O projeto exige Node ≥ 24 (`engines`, `.nvmrc`): Fastify 5, TypeScript 7 e `--env-file` não rodam no 18, que também saiu de suporte em abril de 2025 | `node:24-alpine` nos 4 Dockerfiles. Mesma família (Alpine), versão compatível |
| 2 | Healthcheck com `curl -f http://localhost:3000/health` | As imagens Alpine **não têm curl**: o healthcheck falharia sempre e nenhum serviço ficaria "healthy" | `wget` do BusyBox, que já vem na imagem. E `127.0.0.1` em vez de `localhost`, que no Alpine pode resolver para `::1` (IPv6), onde o Node não escuta |
| 3 | Bancos nas portas 5432, 5433, 5434, 5435 | São as portas **publicadas no host**. Dentro da rede Docker todo PostgreSQL escuta na 5432; quem conectasse em `projetos-db:5433` falharia | Mapeamento `5433:5432` etc. e `DATABASE_URL` sempre com `:5432` (comentado em cada `docker/*.env`) |
| 4 | Fila de retorno "nomeada dinamicamente com um identificador único para cada requisição" + filas "duráveis" | Uma fila durável por requisição cria e abandona milhares de filas no broker | Uma fila de retorno **por processo**, com nome único (`respostas.<uuid>`), exclusiva e apagada ao desconectar (por isso não durável), e um `correlationId` por requisição. As filas de trabalho continuam duráveis, com mensagens persistentes e *publisher confirms*. Pedido de RPC tem `expiration`: se ninguém atender a tempo, o broker descarta em vez de acumular |
| 5 | Copiar fonte, `npm install` e `node dist/main.js` | Sem compilar, não existe `dist/`. O ponto de entrada da API é `dist/server.js` | `npm ci && npm run build && npm prune --omit=dev` no Dockerfile. Cada serviço tem o próprio comando de entrada |
| 6 | `docker-compose --version` / `docker-compose up -d` | Esse é o Compose v1 (com hífen), descontinuado. No Ubuntu 24.04 com Docker atual o comando é `docker compose` | Documentação e CI usam `docker compose`. O arquivo funciona nos dois |
| 7 | "Copiar o restante do código fonte" | No Windows, isso copiaria o `node_modules` do Windows, com binários nativos (Prisma, esbuild) errados para o Linux do container | `.dockerignore` e `npm ci` dentro do container. O Prisma ganhou `openssl` no Alpine para escolher o engine `linux-musl` |

## 2. Contradições entre texto e diagrama

| # | Contradição | Decisão |
|---|---|---|
| 8 | "Quatro containers principais", mas o diagrama tem 9 (4 serviços + RabbitMQ + 4 bancos) | 9 containers. "Principais" = os 4 microsserviços |
| 9 | O texto cita `profissionais-db` e `projetos-db` "e assim por diante"; só o diagrama mostra `recomendacoes-db` (5434) e `notificacoes-db` (5435) | Os 4 bancos do diagrama. A API grava as recomendações no `recomendacoes-db` |
| 10 | O RabbitMQ é "cinebridge-mq" no texto e "RabbitMQ" no diagrama | `cinebridge-mq`, porque o texto manda usar esse nome como host da conexão |
| 11 | A API consulta projetos "via MQ" (diagrama), mas o texto só dá nome às filas `consulta-profissionais` e `eventos-projetos` | Fila `comandos-projetos` (RPC). A API passou a guardar projetos e convites no `cinebridge-projetos`, que é a "fonte de verdade" segundo o texto |
| 12 | Notificações devem sair na "geração de uma recomendação ou aceitação de um convite", mas no diagrama só o serviço de projetos fala com o de notificações | Os observadores da API (ATV I) continuam reagindo a esses eventos, mas o canal deles agora publica na fila `envio-notificacoes`; quem envia e guarda é o `cinebridge-notificacoes`. No diagrama, isso é a seta "Publica mensagens" da API para o barramento |
| 13 | Rede "interna, isolada da rede externa", mas também "portas mapeadas para o host" | `internal: true` no Docker impede publicar portas, e a API (3000) e o painel do RabbitMQ (15672) precisam ser acessíveis. Rede `cinebridge-net` do tipo bridge; o isolamento vem de publicar tudo, menos a API, só em `127.0.0.1` (acessível apenas da própria máquina) |
| 14 | Credenciais por variáveis de ambiente, mas acesso com as "credenciais padrão guest/guest" | Ambos: `RABBITMQ_DEFAULT_USER/PASS` no compose, com valor `guest/guest`. Em produção basta trocar o valor. Pegadinha extra: o RabbitMQ só aceita `guest` vindo do localhost, e os serviços conectam de outros containers; o compose libera isso explicitamente (`loopback_users []`) |
| 15 | Variáveis de ambiente "dentro do Dockerfile ou, preferencialmente, .env para cada serviço" | Um `.env` por serviço em `backend/docker/`, carregado por `env_file`. Nada de credencial no Dockerfile (ficaria gravado na imagem) |

## 3. Requisito escondido no fim

> "para que o sistema possa ser comercializado [...] ele deve ser compatível com Windows 10 ou superior,
> Linux Ubuntu 24.04.03 ou superior e distribuições Linux derivadas do Ubuntu."

- Os containers são Linux; no Windows 10/11 eles rodam pelo Docker Desktop (WSL 2). O Docker Desktop exige
  o Windows 10 de 64 bits 22H2.
- `.gitattributes` força finais de linha LF: um script ou Dockerfile com CRLF quebra dentro do container.
- Os scripts de teste (`smoke`, `e2e`) são em Node, não em shell, e rodam igual nos dois sistemas.
- O CI roda os testes em **Ubuntu 24.04 e Windows** e o `docker compose` completo no Ubuntu 24.04. Os runners
  Windows do GitHub não rodam containers Linux.
- A versão citada, "24.04.03", não existe nesse formato; a versão real é 24.04.3 (*point release* do 24.04 LTS).

## 4. Desenho

- **Um banco por serviço, sem chave estrangeira entre serviços.** O schema único da ATV III virou quatro
  (`backend/prisma/<servico>/schema.prisma`), cada um com as próprias migrations e o próprio cliente Prisma
  (`#prisma/<servico>`). Onde um serviço precisa de dados de um profissional (membro de equipe, convite, ranking
  de recomendação), guarda uma **cópia (snapshot) em JSON**: o dono do cadastro continua sendo o `cinebridge-profissionais`.
- **As regras de negócio não mudaram.** A API continua com Strategy, Template Method, Observer, Visitor,
  Prototype, Factory, Adapter, Composite e Decorator. A troca para microsserviços é só de **Adapter**:
  `ProfissionalRepositoryRemoto`, `ProjetoRepositoryRemoto`, `ConviteRepositoryRemoto`, `EnviadorEmailRemoto` e
  `CaixaMensagensRemota` implementam as mesmas interfaces de antes, falando pela fila (`infrastructure/remotos/`).
- **Observer nos consumidores**, como pede a etapa 5: o `cinebridge-notificacoes` recebe os eventos de
  `eventos-projetos` e os entrega aos observadores (`NotificadorProjetos`).
- **Falhas:**
  - a mensagem só é confirmada (*ack*) depois de processada;
  - em erro, volta uma vez para a fila e depois é descartada com log, para não ficar em loop;
  - erros de domínio atravessam o RPC e a API devolve o mesmo status HTTP (404, 409...);
  - se a conexão com o RabbitMQ cair, o serviço encerra e o Docker o reinicia (`restart: unless-stopped`).
- **Health checks** (etapa 6): `/health` em todos os serviços checa o próprio banco e o RabbitMQ, e responde 503
  com o motivo se algum falhar. Os bancos usam `pg_isready`; o RabbitMQ usa `rabbitmq-diagnostics ping`.
  O `depends_on: condition: service_healthy` garante a ordem de subida.
- **Dados iniciais:** o `cinebridge-profissionais` gera 2.000 profissionais fictícios se o banco estiver vazio
  (`PROFISSIONAIS_SEED`). Isso substitui o antigo `prisma/seed.ts`.
- **Sem Docker:** sem `RABBITMQ_URL`, a API roda como o monolito em memória da ATV III. Os testes de
  `tests/integration/microsservicos.test.ts` sobem os quatro serviços no mesmo processo com um broker em memória
  (`MensageriaMemoria`), passando cada mensagem por JSON como na rede.

## 5. Limites conhecidos

- O envio de e-mail continua simulado (log + registro no `notificacoes-db`), como nas atividades anteriores.
- Uma mensagem pode ser processada mais de uma vez (entrega "pelo menos uma vez"): se um observador falha,
  a mensagem volta e todos rodam de novo. Para notificações, uma duplicata é aceitável.
- A carga inicial de profissionais supõe uma réplica do serviço; duas subindo juntas com o banco vazio colidiriam.
- O `cinebridge-projetos` grava o projeto e depois publica o evento, sem transação entre os dois. Se o RabbitMQ
  cair entre um e outro, o evento se perde. A correção de produção seria o padrão *Transactional Outbox*.
- Se um serviço não responder a tempo, a API devolve 500 (erro inesperado), e não 503. A exceção é a busca de
  profissionais, que tem cache e fallback desde a ATV I.
- Duas requisições simultâneas alterando o mesmo projeto podem sobrescrever uma à outra (sem trava otimista).
  O problema já existia na ATV III com Prisma.
