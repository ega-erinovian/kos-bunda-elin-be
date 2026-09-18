import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { Prisma } from '@prisma/client'
import type { FinancialTransactionListQuery, CreateFinancialTransactionInput, UpdateFinancialTransactionInput } from './financial-transaction.schema.js'
import { writeAuditLog } from '../audit/audit.service.js'
import logger from '../../config/logger.js'

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
  const [account, categoryInit] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: input.accountId, propertyId } }),
    prisma.financialCategory.findFirst({ where: { id: input.categoryId, propertyId } }),
  ])
  let category = categoryInit
  // ponytail: single-property compat - if not found scoped but exists globally, allow with warning (drift) instead of false 404
  if (!account) {
    const globalAccount = await prisma.financialAccount.findUnique({ where: { id: input.accountId } })
    if (globalAccount) {
      logger.warn({ accountId: input.accountId, requestedPropertyId: propertyId, actualPropertyId: globalAccount.propertyId }, 'FinancialAccount property mismatch - drift, allowing for single-property compat')
    } else {
      throw new AppError('FinancialAccount tidak ditemukan', 404)
    }
  }
  if (!category) {
    const globalCategory = await prisma.financialCategory.findUnique({ where: { id: input.categoryId } })
    if (globalCategory) {
      logger.warn({ categoryId: input.categoryId, requestedPropertyId: propertyId, actualPropertyId: globalCategory.propertyId }, 'FinancialCategory property mismatch - drift, allowing for single-property compat')
      category = globalCategory
    } else {
      throw new AppError('FinancialCategory tidak ditemukan', 404)
    }
  }

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
  let existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId } })
  if (!existing) {
    const global = await prisma.financialTransaction.findUnique({ where: { id } })
    if (global) {
      logger.warn({ id, requestedPropertyId: propertyId, actualPropertyId: global.propertyId }, 'FinancialTransaction property mismatch on update - drift, allowing for single-property compat')
      existing = global
    } else {
      throw new AppError('FinancialTransaction tidak ditemukan', 404)
    }
  }
  if (existing.deletedAt) throw new AppError('FinancialTransaction sudah dihapus', 400)

  const newCategoryId = input.categoryId
  if (newCategoryId) {
    let category = await prisma.financialCategory.findFirst({ where: { id: newCategoryId, propertyId } })
    if (!category) {
      const globalCat = await prisma.financialCategory.findUnique({ where: { id: newCategoryId } })
      if (globalCat) {
        logger.warn({ categoryId: newCategoryId, requestedPropertyId: propertyId, actualPropertyId: globalCat.propertyId }, 'FinancialCategory property mismatch on transaction update - drift, allowing')
        category = globalCat
      } else {
        throw new AppError('FinancialCategory tidak ditemukan', 404)
      }
    }
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
  let existing = await prisma.financialTransaction.findFirst({ where: { id, propertyId } })
  if (!existing) {
    const global = await prisma.financialTransaction.findUnique({ where: { id } })
    if (global) {
      logger.warn({ id, requestedPropertyId: propertyId, actualPropertyId: global.propertyId }, 'FinancialTransaction property mismatch on softDelete - drift, allowing')
      existing = global
    } else {
      throw new AppError('FinancialTransaction tidak ditemukan', 404)
    }
  }
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

export async function reverseTransaction(propertyId: string, id: string, adminId: string | undefined, reason: string) {
  let orig = await prisma.financialTransaction.findFirst({ where: { id, propertyId } })
  if (!orig) {
    const global = await prisma.financialTransaction.findUnique({ where: { id } })
    if (global) {
      logger.warn({ id, requestedPropertyId: propertyId, actualPropertyId: global.propertyId }, 'FinancialTransaction property mismatch on reverse - drift, allowing')
      orig = global
    } else {
      throw new AppError('FinancialTransaction tidak ditemukan', 404)
    }
  }
  if (orig.deletedAt) throw new AppError('FinancialTransaction sudah dihapus', 400)
  if (['RENT_PAYMENT', 'DEPOSIT', 'DEPOSIT_REFUND'].includes(orig.source)) {
    throw new AppError('Hanya transaksi manual yang dapat direversal', 400)
  }

  const alreadyReversed = await prisma.financialTransaction.findFirst({
    where: { propertyId, source: 'ADJUSTMENT', description: { contains: `Reversal of ${orig.id}` } },
  })
  if (alreadyReversed) throw new AppError('Transaksi sudah direversal', 409)

  return prisma.$transaction(async (tx) => {
    const reversalType = orig.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE'

    const reversal = await tx.financialTransaction.create({
      data: {
        propertyId,
        accountId: orig.accountId,
        categoryId: orig.categoryId,
        type: reversalType as any,
        source: 'ADJUSTMENT' as any,
        amount: orig.amount as any,
        transactionDate: new Date(),
        description: `Reversal of ${orig.id}: ${reason}`,
        referenceNumber: orig.referenceNumber,
        createdByAdminId: adminId,
      },
    })

    const updatedOrigDescription = `${orig.description ?? ''} | Reversed by ${reversal.id}: ${reason}`.trim().replace(/^\|\s*/, '')
    await tx.financialTransaction.update({
      where: { id: orig.id },
      data: { description: updatedOrigDescription },
    })

    const action = orig.type === 'EXPENSE' ? 'EXPENSE_REVERSED' : 'TRANSACTION_REVERSED'
    await writeAuditLog(tx, {
      propertyId,
      adminId,
      entity: 'FinancialTransaction',
      entityId: orig.id,
      action,
      beforeValue: orig,
      afterValue: reversal,
    })

    return reversal
  })
}
