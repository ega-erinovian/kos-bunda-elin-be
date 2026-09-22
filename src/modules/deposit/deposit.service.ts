import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { Prisma } from '@prisma/client'
import type { CreateDepositInput, ListDepositQuery, DeductDepositInput, RefundDepositInput } from './deposit.schema.js'
import { writeAuditLog } from '../audit/audit.service.js'

async function resolveAccount(tx: any, propertyId: string): Promise<{ id: string }> {
  let account = await tx.financialAccount.findFirst({
    where: { propertyId, type: 'CASH', active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!account) {
    account = await tx.financialAccount.findFirst({
      where: { propertyId, active: true },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!account) {
    account = await tx.financialAccount.create({
      data: {
        propertyId,
        name: 'Cash',
        type: 'CASH',
        openingBalance: 0,
      },
    })
  }
  return account
}

async function resolveCategory(
  tx: any,
  propertyId: string,
  code: string,
  type: 'INCOME' | 'EXPENSE',
  name: string,
): Promise<{ id: string }> {
  let category = await tx.financialCategory.findFirst({
    where: { propertyId, code },
  })
  if (!category) {
    category = await tx.financialCategory.create({
      data: {
        propertyId,
        type: type as any,
        code,
        name,
      },
    })
  } else if (category.type !== type) {
    throw new AppError(`Category ${code} harus bertipe ${type}`, 400)
  }
  return category
}

export async function receiveDeposit(propertyId: string, adminId: string | undefined, input: CreateDepositInput) {
  const penyewa = await prisma.penyewa.findFirst({
    where: { id: input.penyewaId, kamar: { propertyId } },
  })
  if (!penyewa) {
    throw new AppError('Penyewa tidak ditemukan', 404)
  }

  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.create({
      data: {
        propertyId,
        penyewaId: input.penyewaId,
        amountReceived: input.amountReceived as any,
        receivedDate: input.receivedDate,
        deductionAmount: 0 as any,
        status: 'HELD' as any,
      },
    })

    const account = await resolveAccount(tx as any, propertyId)
    const category = await resolveCategory(tx as any, propertyId, 'DEPOSIT', 'INCOME', 'Deposit')

    await (tx as any).financialTransaction.create({
      data: {
        propertyId,
        accountId: account.id,
        categoryId: category.id,
        tenantId: input.penyewaId,
        depositId: deposit.id,
        type: 'INCOME' as any,
        source: 'DEPOSIT' as any,
        amount: input.amountReceived as any,
        transactionDate: input.receivedDate,
        description: `Deposit diterima untuk penyewa ${input.penyewaId}`,
        createdByAdminId: adminId,
      },
    })

    await writeAuditLog(tx as any, {
      propertyId,
      adminId,
      entity: 'Deposit',
      entityId: deposit.id,
      action: 'DEPOSIT_RECEIVED',
      afterValue: deposit,
    })

    return deposit
  })
}

export async function listDeposits(propertyId: string, query: ListDepositQuery) {
  const where: Prisma.DepositWhereInput = { propertyId }
  if (query.penyewaId) where.penyewaId = query.penyewaId
  if (query.status) where.status = query.status as any

  const data = await prisma.deposit.findMany({
    where,
    orderBy: { receivedDate: 'desc' },
  })

  return { data }
}

export async function deductDeposit(
  propertyId: string,
  id: string,
  adminId: string | undefined,
  input: DeductDepositInput,
) {
  const existing = await prisma.deposit.findFirst({ where: { id, propertyId } })
  if (!existing) {
    throw new AppError('Deposit tidak ditemukan', 404)
  }
  if (existing.status === 'REFUNDED' || existing.status === 'FORFEITED') {
    throw new AppError('Deposit sudah selesai, tidak dapat dideduct', 400)
  }

  const deductionAmount = Number(input.deductionAmount)
  const currentRefund = existing.refundAmount ? Number(existing.refundAmount as any) : 0
  const amountReceived = Number(existing.amountReceived as any)

  if (deductionAmount + currentRefund > amountReceived + 1e-9) {
    throw new AppError('deductionAmount + refundAmount tidak boleh melebihi amountReceived', 400)
  }

  return prisma.$transaction(async (tx) => {
    const before = { ...existing }
    const updated = await tx.deposit.update({
      where: { id },
      data: {
        deductionAmount: deductionAmount as any,
        deductionReason: input.deductionReason,
      },
    })

    await writeAuditLog(tx as any, {
      propertyId,
      adminId,
      entity: 'Deposit',
      entityId: id,
      action: 'DEPOSIT_DEDUCTED',
      beforeValue: before,
      afterValue: updated,
    })

    return updated
  })
}

export async function refundDeposit(
  propertyId: string,
  id: string,
  adminId: string | undefined,
  input: RefundDepositInput,
) {
  const existing = await prisma.deposit.findFirst({ where: { id, propertyId } })
  if (!existing) {
    throw new AppError('Deposit tidak ditemukan', 404)
  }
  if (existing.status === 'REFUNDED' || existing.status === 'FORFEITED') {
    throw new AppError('Deposit sudah direfund/forfeited', 409)
  }

  const refundAmount = Number(input.refundAmount)
  const deductionAmount = Number(existing.deductionAmount as any)
  const amountReceived = Number(existing.amountReceived as any)

  if (refundAmount + deductionAmount > amountReceived + 1e-9) {
    throw new AppError('refundAmount + deductionAmount tidak boleh melebihi amountReceived', 400)
  }

  if (input.refundDate < existing.receivedDate) {
    throw new AppError('refundDate tidak boleh sebelum receivedDate', 400)
  }

  return prisma.$transaction(async (tx) => {
    const before = { ...existing }

    const account = await resolveAccount(tx as any, propertyId)
    const category = await resolveCategory(tx as any, propertyId, 'DEPOSIT_REFUND', 'EXPENSE', 'Refund Deposit')

    await (tx as any).financialTransaction.create({
      data: {
        propertyId,
        accountId: account.id,
        categoryId: category.id,
        tenantId: existing.penyewaId,
        depositId: existing.id,
        type: 'EXPENSE' as any,
        source: 'DEPOSIT_REFUND' as any,
        amount: refundAmount as any,
        transactionDate: input.refundDate,
        description: `Refund deposit untuk penyewa ${existing.penyewaId}`,
        createdByAdminId: adminId,
      },
    })

    const totalUsed = refundAmount + deductionAmount
    let newStatus: string = 'PARTIALLY_REFUNDED'
    if (Math.abs(totalUsed - amountReceived) < 1e-9 || totalUsed >= amountReceived - 1e-9) {
      newStatus = 'REFUNDED'
    }

    const updated = await tx.deposit.update({
      where: { id },
      data: {
        refundAmount: refundAmount as any,
        refundDate: input.refundDate,
        status: newStatus as any,
      },
    })

    await writeAuditLog(tx as any, {
      propertyId,
      adminId,
      entity: 'Deposit',
      entityId: id,
      action: 'DEPOSIT_REFUNDED',
      beforeValue: before,
      afterValue: updated,
    })

    return updated
  })
}
