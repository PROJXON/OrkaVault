-- AlterTable
ALTER TABLE "Account" ADD COLUMN "customFieldsSecretRef" TEXT;

-- CreateTable
CREATE TABLE "AccountCustomField" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountCustomField_accountId_idx" ON "AccountCustomField"("accountId");

-- AddForeignKey
ALTER TABLE "AccountCustomField" ADD CONSTRAINT "AccountCustomField_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
