-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_idempotencyKey_key" ON "PaymentRecord"("idempotencyKey");
