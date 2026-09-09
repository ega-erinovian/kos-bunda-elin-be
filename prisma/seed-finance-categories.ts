import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })

export const DEFAULT_CATEGORIES: Array<{ type: 'INCOME' | 'EXPENSE'; code: string; name: string }> = [
  // INCOME
  { type: 'INCOME', code: 'RENT', name: 'Sewa Kamar' },
  { type: 'INCOME', code: 'LATE_FEE', name: 'Denda Keterlambatan' },
  { type: 'INCOME', code: 'PARKING', name: 'Parkir' },
  { type: 'INCOME', code: 'LAUNDRY', name: 'Laundry' },
  { type: 'INCOME', code: 'OTHER_INCOME', name: 'Pemasukan Lain' },
  // EXPENSE
  { type: 'EXPENSE', code: 'ELECTRICITY', name: 'Listrik' },
  { type: 'EXPENSE', code: 'WATER', name: 'Air' },
  { type: 'EXPENSE', code: 'INTERNET', name: 'Internet' },
  { type: 'EXPENSE', code: 'SALARY', name: 'Gaji' },
  { type: 'EXPENSE', code: 'CLEANING', name: 'Kebersihan' },
  { type: 'EXPENSE', code: 'MAINTENANCE', name: 'Pemeliharaan' },
  { type: 'EXPENSE', code: 'REPAIR', name: 'Perbaikan' },
  { type: 'EXPENSE', code: 'TAX', name: 'Pajak' },
  { type: 'EXPENSE', code: 'SUPPLIES', name: 'Perlengkapan' },
  { type: 'EXPENSE', code: 'SECURITY', name: 'Keamanan' },
  { type: 'EXPENSE', code: 'RENOVATION', name: 'Renovasi' },
  { type: 'EXPENSE', code: 'MARKETING', name: 'Pemasaran' },
  { type: 'EXPENSE', code: 'ADMINISTRATIVE', name: 'Administrasi' },
  { type: 'EXPENSE', code: 'OTHER_EXPENSE', name: 'Pengeluaran Lain' },
]

export async function seedFinanceCategories(prismaClient: PrismaClient, propertyId: string) {
  for (const c of DEFAULT_CATEGORIES) {
    await prismaClient.financialCategory.upsert({
      where: { propertyId_code: { propertyId, code: c.code } },
      update: { name: c.name, type: c.type as any, active: true },
      create: { propertyId, type: c.type as any, code: c.code, name: c.name, active: true },
    })
  }
}

async function main() {
  const properties = await prisma.property.findMany({ select: { id: true } })
  for (const p of properties) {
    await seedFinanceCategories(prisma, p.id)
    console.log(`Seeded finance categories for property ${p.id}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-finance-categories.ts')) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
