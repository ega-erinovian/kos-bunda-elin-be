-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('HELD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FORFEITED');

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "penyewaId" TEXT NOT NULL,
    "amountReceived" DECIMAL(14,2) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "deductionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductionReason" TEXT,
    "refundAmount" DECIMAL(14,2),
    "refundDate" TIMESTAMP(3),
    "status" "DepositStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposit_propertyId_penyewaId_idx" ON "Deposit"("propertyId", "penyewaId");

-- CreateIndex
CREATE INDEX "Deposit_propertyId_status_idx" ON "Deposit"("propertyId", "status");

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
