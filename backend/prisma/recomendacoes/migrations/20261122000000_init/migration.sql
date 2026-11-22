-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('DIRETOR', 'DIRETOR_FOTOGRAFIA', 'SONOPLASTA', 'EDITOR', 'ROTEIRISTA', 'EFEITOS_VISUAIS');

-- CreateTable
CREATE TABLE "recomendacoes" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "estrategia" TEXT NOT NULL,
    "parcial" BOOLEAN NOT NULL,
    "papeis_sem_candidatos" "Papel"[],
    "ranking" JSONB NOT NULL,
    "gerada_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recomendacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recomendacoes_projeto_id_idx" ON "recomendacoes"("projeto_id");

