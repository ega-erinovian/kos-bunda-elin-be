import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { Prisma } from '@prisma/client'
import type { CreateExpenseInput, ListExpenseQuery, UpdateExpenseInput } from './expense.schema.js'
import { writeAuditLog } from '../audit/audit.service.js'
import { reverseTransaction } from '../financial-transaction/financial-transaction.service.js'

export async function createExpense(propertyId: string, adminId: string | undefined, input: CreateExpenseInput) {
  const [account, category] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: input.accountId, propertyId } }),
    prisma.financialCategory.findFirst({ where: { id: input.categoryId, propertyId } }),
  ])
  if (!account) throw new AppError('FinancialAccount tidak ditemukan', 404)
  if (!category) throw new AppError('FinancialCategory tidak ditemukan', 404)
  if (category.type !== 'EXPENSE') {
    throw new AppError(`Category type ${category.type} tidak cocok untuk expense (harus EXPENSE)`, 400)
  }

  return prisma.$transaction(async (tx) => {
    const trx = await tx.financialTransaction.create({
      data: {
        propertyId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: 'EXPENSE' as any,
        source: 'MANUAL_EXPENSE' as any,
        amount: input.amount as any,
        transactionDate: input.transactionDate,
        vendorName: input.vendorName,
        receiptUrl: input.receiptUrl,
        description: input.description,
        referenceNumber: input.referenceNumber,
        createdByAdminId: adminId,
      },
    })

    await writeAuditLog(tx, {
      propertyId,
      adminId,
      entity: 'FinancialTransaction',
      entityId: trx.id,
      action: 'EXPENSE_CREATED',
      afterValue: trx,
    })

    return trx
  })
}

export async function listExpenses(propertyId: string, query: ListExpenseQuery) {
  const where: Prisma.FinancialTransactionWhereInput = { propertyId, deletedAt: null, type: 'EXPENSE' }

  if (query.categoryId) where.categoryId = query.categoryId
  if (query.accountId) where.accountId = query.accountId
  if (query.from || query.to) {
    where.transactionDate = {}
    if (query.from) where.transactionDate.gte = query.from
    if (query.to) where.transactionDate.lte = query.to
  }
  if (query.vendorName) {
    where.vendorName = { contains: query.vendorName, mode: 'insensitive' }
  }

  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50

  const [data, total] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.financialTransaction.count({ where }),
  ])

  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

export async function updateExpense(propertyId: string, id: string, adminId: string | undefined, input: UpdateExpenseInput) {
  const existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId, type: 'EXPENSE' } })
  if (!existing) throw new AppError('FinancialTransaction tidak ditemukan', 404)
  if (existing.deletedAt) throw new AppError('FinancialTransaction sudah dihapus', 400)

  return prisma.$transaction(async (tx) => {
    const before = { ...existing }
    const updated = await tx.financialTransaction.update({
      where: { id },
      data: {
        vendorName: input.vendorName ?? undefined,
        receiptUrl: input.receiptUrl ?? undefined,
        description: input.description ?? undefined,
      },
    })

    await writeAuditLog(tx, {
      propertyId,
      adminId,
      entity: 'FinancialTransaction',
      entityId: id,
      action: 'EXPENSE_UPDATED',
      beforeValue: before,
      afterValue: updated,
    })

    return updated
  })
}

export async function reverseExpense(propertyId: string, id: string, adminId: string | undefined, reason: string) {
  const existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId, type: 'EXPENSE' } })
  if (!existing) throw new AppError('FinancialTransaction tidak ditemukan', 404)

  const reversal = await reverseTransaction(propertyId, id, adminId, reason)
  return reversal
}
