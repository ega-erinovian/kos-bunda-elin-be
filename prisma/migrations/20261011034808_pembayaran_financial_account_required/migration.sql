/*
  Warnings:

  - Made the column `financialAccountId` on table `Pembayaran` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Pembayaran" DROP CONSTRAINT "Pembayaran_financialAccountId_fkey";

-- AlterTable
ALTER TABLE "Pembayaran" ALTER COLUMN "financialAccountId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
