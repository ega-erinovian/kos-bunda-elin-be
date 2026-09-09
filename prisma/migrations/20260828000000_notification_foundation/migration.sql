
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WEB_PUSH', 'WHATSAPP', 'EMAIL', 'SMS');
-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
-- DropForeignKey
ALTER TABLE "NotificationLog" DROP CONSTRAINT "NotificationLog_penyewaId_fkey";
-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "channel" "NotificationChannel" NOT NULL DEFAULT 'WEB_PUSH',
ADD COLUMN     "propertyId" TEXT NOT NULL;
-- AlterTable
ALTER TABLE "NotificationLog" DROP COLUMN "waktuKirim",
ADD COLUMN     "channel" "NotificationChannel" NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "pembayaranId" TEXT,
ADD COLUMN     "propertyId" TEXT NOT NULL,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "recipient" TEXT NOT NULL,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "penyewaId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING';
-- AlterTable
ALTER TABLE "ReminderConfig" DROP COLUMN "hMinusHari",
DROP COLUMN "hPlusHari",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "channels" "NotificationChannel"[] DEFAULT ARRAY['WEB_PUSH']::"NotificationChannel"[],
ADD COLUMN     "offsets" INTEGER[] DEFAULT ARRAY[-7, -3, -1, 0, 1, 3, 7]::INTEGER[];
-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_propertyId_channel_jenis_key" ON "MessageTemplate"("propertyId", "channel", "jenis");
-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_pembayaranId_fkey" FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id") ON DELETE SET NULL ON UPDATE CASCADE;

