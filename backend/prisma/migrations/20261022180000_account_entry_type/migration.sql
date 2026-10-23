-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('LOGIN', 'SECURE_NOTE');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "entryType" "EntryType" NOT NULL DEFAULT 'LOGIN';
