import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import type { CreateFinancialAccountInput, UpdateFinancialAccountInput } from './financial-account.schema.js'

export async function listAccounts(propertyId: string) {
  return prisma.financialAccount.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createAccount(propertyId: string, input: CreateFinancialAccountInput) {
  const existing = await prisma.financialAccount.findUnique({
    where: { propertyId_name: { propertyId, name: input.name } },
  })
  if (existing) throw new AppError('FinancialAccount dengan nama ini sudah ada', 409)
  return prisma.financialAccount.create({
    data: {
      propertyId,
      name: input.name,
      type: input.type as any,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      openingBalance: input.openingBalance ?? 0,
    },
  })
}

export async function updateAccount(propertyId: string, id: string, input: UpdateFinancialAccountInput) {
  const existing = await prisma.financialAccount.findFirst({ where: { id, propertyId } })
  if (!existing) throw new AppError('FinancialAccount tidak ditemukan', 404)
  if (input.name && input.name !== existing.name) {
    const dup = await prisma.financialAccount.findUnique({
      where: { propertyId_name: { propertyId, name: input.name } },
    })
    if (dup) throw new AppError('FinancialAccount dengan nama ini sudah ada', 409)
  }
  return prisma.financialAccount.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type as any,
      bankName: input.bankName ?? undefined,
      accountNumber: input.accountNumber ?? undefined,
      openingBalance: input.openingBalance as any,
      active: input.active,
    },
  })
}
