import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })

// ponytail: one-off drift fix for single-property deployments - aligns orphaned FinancialAccount/Category to canonical property
async function main() {
  const canonicalId = process.env.DEFAULT_PROPERTY_ID || 'default-property'
  const properties = await prisma.property.findMany({ select: { id: true } })
  if (properties.length === 0) {
    console.error('No Property found - run seed first')
    process.exit(1)
  }
  if (properties.length > 1) {
    console.warn(`Found ${properties.length} properties - refusing to auto-merge. Specify canonical manually or handle multi-tenant case.`)
    console.warn('Properties:', properties.map(p => p.id))
    process.exit(0)
  }
  const canonical = properties[0].id
  // if env points elsewhere but only one property exists, use the existing one
  const targetId = properties.find(p => p.id === canonicalId)?.id ?? canonical
  console.log(`Canonical property: ${targetId}`)

  const [acc, cat, admin, propCheck] = await Promise.all([
    prisma.financialAccount.count({ where: { propertyId: { not: targetId } } }),
    prisma.financialCategory.count({ where: { propertyId: { not: targetId } } }),
    prisma.admin.count({ where: { propertyId: { not: targetId } } }),
    prisma.financialTransaction.count({ where: { propertyId: { not: targetId } } }),
  ])
  console.log(`Drift counts - Accounts: ${acc}, Categories: ${cat}, Admins: ${admin}, Transactions: ${propCheck}`)
  if (acc + cat + admin + propCheck === 0) {
    console.log('No drift - all rows already on canonical property')
    return
  }

  const [uAcc, uCat, uAdmin, uTrx] = await Promise.all([
    acc ? prisma.financialAccount.updateMany({ where: { propertyId: { not: targetId } }, data: { propertyId: targetId } }) : { count: 0 },
    cat ? prisma.financialCategory.updateMany({ where: { propertyId: { not: targetId } }, data: { propertyId: targetId } }) : { count: 0 },
    admin ? prisma.admin.updateMany({ where: { propertyId: { not: targetId } }, data: { propertyId: targetId } }) : { count: 0 },
    propCheck ? prisma.financialTransaction.updateMany({ where: { propertyId: { not: targetId } }, data: { propertyId: targetId } }) : { count: 0 },
  ])
  console.log(`Fixed - Accounts: ${uAcc.count}, Categories: ${uCat.count}, Admins: ${uAdmin.count}, Transactions: ${uTrx.count}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
