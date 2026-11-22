# cinebridge-profissionais: cadastro e consulta de profissionais (porta 3001).
# Contexto de build: ./backend (o código de domínio é compartilhado pelos quatro serviços).
#
# O enunciado pede node:18-alpine, mas o projeto exige Node >= 24 (Fastify 5, TypeScript 7, --env-file),
# e o Node 18 saiu de suporte em abril de 2025. Ver docs/decisoes-atv4.md.
FROM node:24-alpine

# O Prisma precisa do OpenSSL no Alpine para escolher o engine certo (linux-musl-openssl-3.0.x).
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Dependências primeiro: a camada do npm ci só é refeita quando package*.json ou os schemas mudam.
# npm ci (e não npm install): instala exatamente o lockfile, com os binários nativos do Linux.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node

# Aplica as migrations do próprio banco e sobe o serviço (exec: o Node recebe o SIGTERM do docker stop).
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/profissionais/schema.prisma && exec node dist/servicos/profissionais.js"]
