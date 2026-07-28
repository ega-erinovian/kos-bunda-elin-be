import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })

async function main() {
  const property = await prisma.property.upsert({
    where: { id: 'default-property' },
    update: {},
    create: {
      id: 'default-property',
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

  await prisma.reminderConfig.upsert({
    where: { propertyId: property.id },
    update: {},
    create: {
      propertyId: property.id,
      hMinusHari: [3, 1, 0],
      hPlusHari: [3, 7],
    },
  })

  const kamarData = [
    { nomor: '1A', lantai: '1', harga: 750000 },
    { nomor: '1B', lantai: '1', harga: 750000 },
    { nomor: '2A', lantai: '2', harga: 850000 },
    { nomor: '2B', lantai: '2', harga: 850000 },
    { nomor: '3A', lantai: '3', harga: 1000000 },
  ]

  for (const k of kamarData) {
    await prisma.kamar.upsert({
      where: { propertyId_nomor: { propertyId: property.id, nomor: k.nomor } },
      update: {},
      create: {
        nomor: k.nomor,
        lantai: k.lantai,
        harga: k.harga,
        propertyId: property.id,
      },
    })
  }

  console.log('Seed completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
