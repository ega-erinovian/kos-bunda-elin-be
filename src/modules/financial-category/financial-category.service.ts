import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import type { CreateFinancialCategoryInput, UpdateFinancialCategoryInput } from './financial-category.schema.js'

export async function listCategories(propertyId: string, type?: string) {
  const where: any = { propertyId }
  if (type) where.type = type
  return prisma.financialCategory.findMany({ where, orderBy: { code: 'asc' } })
}

export async function createCategory(propertyId: string, input: CreateFinancialCategoryInput) {
  const existing = await prisma.financialCategory.findUnique({
    where: { propertyId_code: { propertyId, code: input.code } },
  })
  if (existing) throw new AppError('FinancialCategory dengan code ini sudah ada', 409)
  return prisma.financialCategory.create({
    data: {
      propertyId,
      type: input.type as any,
      code: input.code,
      name: input.name,
    },
  })
}

export async function updateCategory(propertyId: string, id: string, input: UpdateFinancialCategoryInput) {
  const existing = await prisma.financialCategory.findFirst({ where: { id, propertyId } })
  if (!existing) throw new AppError('FinancialCategory tidak ditemukan', 404)
  if (input.code && input.code !== existing.code) {
    const dup = await prisma.financialCategory.findUnique({
      where: { propertyId_code: { propertyId, code: input.code } },
    })
    if (dup) throw new AppError('FinancialCategory dengan code ini sudah ada', 409)
  }
  return prisma.financialCategory.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      active: input.active,
    },
  })
}
