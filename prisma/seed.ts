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

  const penyewaData = [
    { nama: 'Siti Nurhaliza', noHp: '628123456701', kamarIdx: 0, tanggalJatuhTempo: 5 },
    { nama: 'Dewi Sartika', noHp: '628123456702', kamarIdx: 1, tanggalJatuhTempo: 10 },
    { nama: 'Rina Wijaya', noHp: '628123456703', kamarIdx: 2, tanggalJatuhTempo: 15 },
    { nama: 'Aminah Putri', noHp: '628123456704', kamarIdx: 3, tanggalJatuhTempo: 20 },
    { nama: 'Lestari Indah', noHp: '628123456705', kamarIdx: 4, tanggalJatuhTempo: 25 },
    { nama: 'Fitri Handayani', noHp: '628123456706', kamarIdx: 5, tanggalJatuhTempo: 1 },
    { nama: 'Wulan Dari', noHp: '628123456707', kamarIdx: 6, tanggalJatuhTempo: 8 },
    { nama: 'Sri Mulyani', noHp: '628123456708', kamarIdx: 7, tanggalJatuhTempo: 12 },
    { nama: 'Kartika Sari', noHp: '628123456709', kamarIdx: 8, tanggalJatuhTempo: 18 },
    { nama: 'Ayu Ting Ting', noHp: '628123456710', kamarIdx: 9, tanggalJatuhTempo: 22 },
  ]

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  for (const p of penyewaData) {
    const kamar = kamars[p.kamarIdx]
    const tanggalMulaiSewa = new Date(currentYear, currentMonth - 4, p.tanggalJatuhTempo)

    const penyewa = await prisma.penyewa.upsert({
      where: {
        id: `penyewa-seed-${p.kamarIdx}`,
      },
      update: {},
      create: {
        id: `penyewa-seed-${p.kamarIdx}`,
        nama: p.nama,
        noHp: p.noHp,
        kamarId: kamar.id,
        tanggalMulaiSewa,
        nominalSewa: kamar.harga,
        tanggalJatuhTempo: p.tanggalJatuhTempo,
        aktif: true,
      },
    })

    for (let monthOffset = -3; monthOffset <= 1; monthOffset++) {
      const periodeDate = new Date(currentYear, currentMonth - 1 + monthOffset, 1)
      const periodeBulan = periodeDate.getMonth() + 1
      const periodeTahun = periodeDate.getFullYear()
      const tanggalJatuhTempo = new Date(periodeTahun, periodeBulan - 1, p.tanggalJatuhTempo)

      let status: 'BELUM_BAYAR' | 'LUNAS' | 'TERLAMBAT' = 'BELUM_BAYAR'
      let tanggalBayar: Date | null = null

      if (monthOffset < 0) {
        status = 'LUNAS'
        tanggalBayar = new Date(
          periodeTahun,
          periodeBulan - 1,
          p.tanggalJatuhTempo - Math.floor(Math.random() * 3),
        )
      } else if (monthOffset === 0) {
        const dayOfMonth = today.getDate()
        if (dayOfMonth > p.tanggalJatuhTempo + 2) {
          status = 'TERLAMBAT'
        } else if (dayOfMonth >= p.tanggalJatuhTempo - 3) {
          status = 'BELUM_BAYAR'
        } else {
          status = 'BELUM_BAYAR'
        }
      } else {
        status = 'BELUM_BAYAR'
      }

      await prisma.pembayaran.upsert({
        where: {
          penyewaId_periodeBulan_periodeTahun: {
            penyewaId: penyewa.id,
            periodeBulan,
            periodeTahun,
          },
        },
        update: {},
        create: {
          penyewaId: penyewa.id,
          periodeBulan,
          periodeTahun,
          tanggalJatuhTempo,
          status,
          tanggalBayar,
          nominal: kamar.harga,
          catatan: monthOffset < 0 ? 'Pembayaran tepat waktu' : null,
        },
      })
    }
  }

  console.log('Seed completed: 10 penyewa with payment history created')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
