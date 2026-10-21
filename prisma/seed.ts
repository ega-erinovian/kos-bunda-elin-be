import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import { seedFinanceCategories } from './seed-finance-categories.js'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { schema: 'kos-bunda-elin' }) })

async function main() {
  const defaultPropertyId = process.env.DEFAULT_PROPERTY_ID || 'default-property'
  const property = await prisma.property.upsert({
    where: { id: defaultPropertyId },
    update: {},
    create: {
      id: defaultPropertyId,
      nama: 'Kos Putri Bunda Elin',
      alamat: 'Jl. Contoh No. 123, Kota Contoh',
    },
  })

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@kosbundaelin.test'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      nama: 'Admin Utama',
      email: adminEmail,
      passwordHash,
      role: 'OWNER',
      propertyId: property.id,
    },
  })

  if (process.argv.includes('--admin-only')) {
    console.log('Seed completed (admin only):', adminEmail)
    return
  }

  await prisma.reminderConfig.upsert({
    where: { propertyId: property.id },
    update: {},
    create: {
      propertyId: property.id,
      offsets: [-7, -3, -1, 0, 1, 3, 7],
      channels: ['WEB_PUSH'],
      active: true,
    },
  })

  const defaultTemplates: Array<{
    channel: 'WEB_PUSH' | 'WHATSAPP'
    jenis: 'REMINDER_JATUH_TEMPO' | 'REMINDER_TUNGGAKAN' | 'PENGUMUMAN'
    isi: string
  }> = [
    {
      channel: 'WEB_PUSH',
      jenis: 'REMINDER_JATUH_TEMPO',
      isi: 'Halo {{nama}}, kamar {{kamar}} akan jatuh tempo pada {{tanggalJatuhTempo}}. Nominal: Rp {{nominal}}. Sisa tagihan: Rp {{sisaTagihan}} untuk periode {{periode}}.',
    },
    {
      channel: 'WEB_PUSH',
      jenis: 'REMINDER_TUNGGAKAN',
      isi: 'Halo {{nama}}, kamar {{kamar}} menunggak sejak {{tanggalJatuhTempo}}. Sisa tagihan: Rp {{sisaTagihan}}. Mohon segera lakukan pembayaran untuk periode {{periode}}.',
    },
    {
      channel: 'WEB_PUSH',
      jenis: 'PENGUMUMAN',
      isi: 'Halo {{nama}}, ada pengumuman untuk penghuni kamar {{kamar}} dari {{namaProperty}}.',
    },
    {
      channel: 'WHATSAPP',
      jenis: 'REMINDER_JATUH_TEMPO',
      isi: 'Halo {{nama}}, kamar {{kamar}} akan jatuh tempo pada {{tanggalJatuhTempo}}. Nominal: Rp {{nominal}}. Sisa tagihan: Rp {{sisaTagihan}} untuk periode {{periode}}. Mohon segera lakukan pembayaran. Terima kasih.',
    },
    {
      channel: 'WHATSAPP',
      jenis: 'REMINDER_TUNGGAKAN',
      isi: 'Halo {{nama}}, kamar {{kamar}} menunggak sejak {{tanggalJatuhTempo}}. Sisa tagihan: Rp {{sisaTagihan}}. Mohon segera lakukan pembayaran untuk periode {{periode}}.',
    },
    {
      channel: 'WHATSAPP',
      jenis: 'PENGUMUMAN',
      isi: 'Halo {{nama}}, ada pengumuman untuk penghuni kamar {{kamar}} dari {{namaProperty}}: {{isi}}. - Pengelola',
    },
  ]
  for (const t of defaultTemplates) {
    await prisma.messageTemplate.upsert({
      where: { propertyId_channel_jenis: { propertyId: property.id, channel: t.channel as any, jenis: t.jenis as any } },
      update: {},
      create: { propertyId: property.id, channel: t.channel as any, jenis: t.jenis as any, isi: t.isi, aktif: true },
    })
  }

  await seedFinanceCategories(prisma, property.id)

  const kamarData = [
    { nomor: '1A', lantai: '1', harga: 750000, status: 'TERISI' as const },
    { nomor: '1B', lantai: '1', harga: 750000, status: 'TERISI' as const },
    { nomor: '2A', lantai: '2', harga: 850000, status: 'TERISI' as const },
    { nomor: '2B', lantai: '2', harga: 850000, status: 'TERISI' as const },
    { nomor: '3A', lantai: '3', harga: 1000000, status: 'TERISI' as const },
    { nomor: '3B', lantai: '3', harga: 1000000, status: 'TERISI' as const },
    { nomor: '4A', lantai: '4', harga: 900000, status: 'TERISI' as const },
    { nomor: '4B', lantai: '4', harga: 900000, status: 'TERISI' as const },
    { nomor: '5A', lantai: '5', harga: 800000, status: 'TERISI' as const },
    { nomor: '5B', lantai: '5', harga: 800000, status: 'TERISI' as const },
    { nomor: '6A', lantai: '6', harga: 950000, status: 'KOSONG' as const },
    { nomor: '6B', lantai: '6', harga: 950000, status: 'KOSONG' as const },
  ]

  const kamars = []
  for (const k of kamarData) {
    const kamar = await prisma.kamar.upsert({
      where: { propertyId_nomor: { propertyId: property.id, nomor: k.nomor } },
      update: { status: k.status },
      create: {
        nomor: k.nomor,
        lantai: k.lantai,
        harga: k.harga,
        status: k.status,
        propertyId: property.id,
      },
    })
    kamars.push(kamar)
  }

  console.log('Seed completed: 10 penyewa with payment history created')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
