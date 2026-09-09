import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { Prisma } from '@prisma/client'
import type { FinancialTransactionListQuery, CreateFinancialTransactionInput, UpdateFinancialTransactionInput } from './financial-transaction.schema.js'
import { writeAuditLog } from '../audit/audit.service.js'

function sourceToType(source: string): 'INCOME' | 'EXPENSE' {
  return source === 'MANUAL_INCOME' ? 'INCOME' : 'EXPENSE'
}

export async function listTransactions(propertyId: string, query: FinancialTransactionListQuery) {
  const where: Prisma.FinancialTransactionWhereInput = { propertyId, deletedAt: null }

  if (query.type) where.type = query.type as any
  if (query.categoryId) where.categoryId = query.categoryId
  if (query.accountId) where.accountId = query.accountId
  if (query.from || query.to) {
    where.transactionDate = {}
    if (query.from) where.transactionDate.gte = query.from
    if (query.to) where.transactionDate.lte = query.to
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

  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function createTransaction(propertyId: string, adminId: string | undefined, input: CreateFinancialTransactionInput) {
  // validate account & category belong to property
  const [account, category] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: input.accountId, propertyId } }),
    prisma.financialCategory.findFirst({ where: { id: input.categoryId, propertyId } }),
  ])
  if (!account) throw new AppError('FinancialAccount tidak ditemukan', 404)
  if (!category) throw new AppError('FinancialCategory tidak ditemukan', 404)

  const expectedType = sourceToType(input.source)
  if (category.type !== expectedType) {
    throw new AppError(`Category type ${category.type} tidak cocok dengan source ${input.source}`, 400)
  }

  const type = expectedType as any

  return prisma.$transaction(async (tx) => {
    const trx = await tx.financialTransaction.create({
      data: {
        propertyId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        type,
        source: input.source as any,
        amount: input.amount as any,
        transactionDate: input.transactionDate,
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
      action: 'TRANSACTION_CREATED',
      afterValue: trx,
    })

    return trx
  })
}

export async function updateTransaction(propertyId: string, id: string, adminId: string | undefined, input: UpdateFinancialTransactionInput) {
  const existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId } })
  if (!existing) throw new AppError('FinancialTransaction tidak ditemukan', 404)
  if (existing.deletedAt) throw new AppError('FinancialTransaction sudah dihapus', 400)

  let newCategoryId = input.categoryId
  if (newCategoryId) {
    const category = await prisma.financialCategory.findFirst({ where: { id: newCategoryId, propertyId } })
    if (!category) throw new AppError('FinancialCategory tidak ditemukan', 404)
    if (category.type !== existing.type) {
      throw new AppError(`Category type ${category.type} tidak cocok dengan transaction type ${existing.type}`, 400)
    }
  }

  return prisma.$transaction(async (tx) => {
    const before = { ...existing }
    const updated = await tx.financialTransaction.update({
      where: { id },
      data: {
        description: input.description ?? undefined,
        referenceNumber: input.referenceNumber ?? undefined,
        categoryId: newCategoryId,
      },
    })

    await writeAuditLog(tx, {
      propertyId,
      adminId,
      entity: 'FinancialTransaction',
      entityId: id,
      action: 'TRANSACTION_UPDATED',
      beforeValue: before,
      afterValue: updated,
    })

    return updated
  })
}

export async function softDeleteTransaction(propertyId: string, id: string, adminId: string | undefined) {
  const existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId } })
  if (!existing) throw new AppError('FinancialTransaction tidak ditemukan', 404)
  if (existing.deletedAt) throw new AppError('FinancialTransaction sudah dihapus', 400)

  return prisma.$transaction(async (tx) => {
    const before = { ...existing }
    const updated = await tx.financialTransaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(tx, {
      propertyId,
      adminId,
      entity: 'FinancialTransaction',
      entityId: id,
      action: 'TRANSACTION_SOFT_DELETED',
      beforeValue: before,
      afterValue: updated,
    })

    return updated
  })
}
