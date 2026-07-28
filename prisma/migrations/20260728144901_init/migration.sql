-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "StatusKamar" AS ENUM ('KOSONG', 'TERISI', 'NONAKTIF');

-- CreateEnum
CREATE TYPE "StatusPembayaran" AS ENUM ('BELUM_BAYAR', 'LUNAS', 'TERLAMBAT');

-- CreateEnum
CREATE TYPE "JenisPesan" AS ENUM ('REMINDER_JATUH_TEMPO', 'REMINDER_TUNGGAKAN', 'PENGUMUMAN');

-- CreateEnum
CREATE TYPE "StatusKirim" AS ENUM ('SUKSES', 'GAGAL');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "alamat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kamar" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "lantai" TEXT,
    "harga" DECIMAL(12,2) NOT NULL,
    "status" "StatusKamar" NOT NULL DEFAULT 'KOSONG',
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kamar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penyewa" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "noHp" TEXT NOT NULL,
    "kamarId" TEXT NOT NULL,
    "tanggalMulaiSewa" TIMESTAMP(3) NOT NULL,
    "nominalSewa" DECIMAL(12,2) NOT NULL,
    "tanggalJatuhTempo" INTEGER NOT NULL,
    "tanggalKeluar" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Penyewa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pembayaran" (
    "id" TEXT NOT NULL,
    "penyewaId" TEXT NOT NULL,
    "periodeBulan" INTEGER NOT NULL,
    "periodeTahun" INTEGER NOT NULL,
    "tanggalJatuhTempo" TIMESTAMP(3) NOT NULL,
    "status" "StatusPembayaran" NOT NULL DEFAULT 'BELUM_BAYAR',
    "tanggalBayar" TIMESTAMP(3),
    "nominal" DECIMAL(12,2) NOT NULL,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pembayaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "penyewaId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "jenis" "JenisPesan" NOT NULL,
    "isi" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "hMinusHari" INTEGER[] DEFAULT ARRAY[3, 1, 0]::INTEGER[],
    "hPlusHari" INTEGER[] DEFAULT ARRAY[3, 7]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "penyewaId" TEXT NOT NULL,
    "jenis" "JenisPesan" NOT NULL,
    "isiRingkas" TEXT NOT NULL,
    "waktuKirim" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusKirim" NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Kamar_propertyId_nomor_key" ON "Kamar"("propertyId", "nomor");

-- CreateIndex
CREATE UNIQUE INDEX "Pembayaran_penyewaId_periodeBulan_periodeTahun_key" ON "Pembayaran"("penyewaId", "periodeBulan", "periodeTahun");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderConfig_propertyId_key" ON "ReminderConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kamar" ADD CONSTRAINT "Kamar_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penyewa" ADD CONSTRAINT "Penyewa_kamarId_fkey" FOREIGN KEY ("kamarId") REFERENCES "Kamar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderConfig" ADD CONSTRAINT "ReminderConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
