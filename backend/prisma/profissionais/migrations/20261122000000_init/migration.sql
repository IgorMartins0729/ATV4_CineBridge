-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('DIRETOR', 'DIRETOR_FOTOGRAFIA', 'SONOPLASTA', 'EDITOR', 'ROTEIRISTA', 'EFEITOS_VISUAIS');

-- CreateEnum
CREATE TYPE "TipoCaptacao" AS ENUM ('DOCUMENTARIO', 'FICCAO', 'ANIMACAO');

-- CreateTable
CREATE TABLE "profissionais" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "especialidades" "Papel"[],
    "preco_minimo" DOUBLE PRECISION NOT NULL,
    "preco_maximo" DOUBLE PRECISION NOT NULL,
    "preco_medio" DOUBLE PRECISION NOT NULL,
    "disponivel_de" TIMESTAMP(3) NOT NULL,
    "disponivel_ate" TIMESTAMP(3) NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competencias" (
    "id" SERIAL NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "competencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" SERIAL NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "comentario" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projetos_anteriores" (
    "id" SERIAL NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "genero" TEXT NOT NULL,
    "tipo_captacao" "TipoCaptacao" NOT NULL,
    "ano" INTEGER NOT NULL,

    CONSTRAINT "projetos_anteriores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profissionais_especialidades_idx" ON "profissionais" USING GIN ("especialidades");

-- CreateIndex
CREATE INDEX "profissionais_disponivel_de_disponivel_ate_idx" ON "profissionais"("disponivel_de", "disponivel_ate");

-- CreateIndex
CREATE INDEX "profissionais_preco_medio_idx" ON "profissionais"("preco_medio");

-- CreateIndex
CREATE UNIQUE INDEX "competencias_profissional_id_nome_key" ON "competencias"("profissional_id", "nome");

-- CreateIndex
CREATE INDEX "avaliacoes_profissional_id_idx" ON "avaliacoes"("profissional_id");

-- CreateIndex
CREATE INDEX "projetos_anteriores_profissional_id_idx" ON "projetos_anteriores"("profissional_id");

-- AddForeignKey
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projetos_anteriores" ADD CONSTRAINT "projetos_anteriores_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

