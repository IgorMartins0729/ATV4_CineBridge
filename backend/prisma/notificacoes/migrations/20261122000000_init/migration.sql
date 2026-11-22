-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('EMAIL', 'INTERNA');

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "canal" "Canal" NOT NULL,
    "destinatario" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacoes_destinatario_idx" ON "notificacoes"("destinatario");

