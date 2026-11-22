-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('DIRETOR', 'DIRETOR_FOTOGRAFIA', 'SONOPLASTA', 'EDITOR', 'ROTEIRISTA', 'EFEITOS_VISUAIS');

-- CreateEnum
CREATE TYPE "TipoCaptacao" AS ENUM ('DOCUMENTARIO', 'FICCAO', 'ANIMACAO');

-- CreateEnum
CREATE TYPE "TipoProjeto" AS ENUM ('GERAL', 'DOCUMENTARIO', 'ANIMACAO', 'PUBLICITARIO');

-- CreateEnum
CREATE TYPE "StatusConvite" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusEquipe" AS ENUM ('EM_FORMACAO', 'FORMADA');

-- CreateTable
CREATE TABLE "projetos" (
    "id" TEXT NOT NULL,
    "tipo_projeto" "TipoProjeto" NOT NULL DEFAULT 'GERAL',
    "especificos" JSONB NOT NULL DEFAULT '{}',
    "servicos" JSONB NOT NULL,
    "titulo" TEXT NOT NULL,
    "produtor_id" TEXT NOT NULL,
    "produtor_nome" TEXT NOT NULL,
    "produtor_email" TEXT NOT NULL,
    "genero" TEXT NOT NULL,
    "duracao" DOUBLE PRECISION NOT NULL,
    "orcamento" DOUBLE PRECISION NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "tipo_captacao" "TipoCaptacao" NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "estrategia" TEXT,
    "rejeitados" TEXT[],
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projetos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitos_papel" (
    "projeto_id" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "requisitos_papel_pkey" PRIMARY KEY ("projeto_id","papel")
);

-- CreateTable
CREATE TABLE "equipes" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "status" "StatusEquipe" NOT NULL,
    "data_formacao" TIMESTAMP(3),

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_equipe" (
    "equipe_id" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "profissional" JSONB NOT NULL,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "membros_equipe_pkey" PRIMARY KEY ("equipe_id","papel")
);

-- CreateTable
CREATE TABLE "convites" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "profissional" JSONB NOT NULL,
    "status" "StatusConvite" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL,
    "respondido_em" TIMESTAMP(3),

    CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projetos_produtor_id_idx" ON "projetos"("produtor_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipes_projeto_id_key" ON "equipes"("projeto_id");

-- CreateIndex
CREATE UNIQUE INDEX "membros_equipe_equipe_id_profissional_id_key" ON "membros_equipe"("equipe_id", "profissional_id");

-- CreateIndex
CREATE INDEX "convites_projeto_id_idx" ON "convites"("projeto_id");

-- AddForeignKey
ALTER TABLE "requisitos_papel" ADD CONSTRAINT "requisitos_papel_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_equipe" ADD CONSTRAINT "membros_equipe_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites" ADD CONSTRAINT "convites_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

