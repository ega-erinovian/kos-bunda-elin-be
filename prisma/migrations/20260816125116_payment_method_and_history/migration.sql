-- AlterEnum: Add SEBAGIAN to StatusPembayaran
ALTER TYPE "StatusPembayaran" ADD VALUE 'SEBAGIAN';

-- CreateEnum: PaymentMethod
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'QRIS', 'E_WALLET', 'OTHER');

-- AlterTable: Add totalDibayar to Pembayaran
ALTER TABLE "Pembayaran" ADD COLUMN "totalDibayar" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable: PaymentRecord
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "pembayaranId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "financialAccountId" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_pembayaranId_fkey" FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
