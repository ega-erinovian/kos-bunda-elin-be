import { AppError } from '../../utils/apiError.js'
import { Prisma } from '@prisma/client'

/**
 * Creates the linked FinancialTransaction for a rent PaymentRecord.
 */
export async function createTransactionForPayment(
  tx: Prisma.TransactionClient,
  params: {
    propertyId: string
    paymentRecord: any
    pembayaran: any
    adminId?: string
  }
) {
  let accountId: string | null = params.paymentRecord.financialAccountId ?? null
  let account: any

  if (accountId) {
    account = await (tx as any).financialAccount.findFirst({
      where: { id: accountId, propertyId: params.propertyId },
    })
    if (!account) throw new AppError('FinancialAccount tidak ditemukan', 404)
  } else {
    account = await (tx as any).financialAccount.findFirst({
      where: { propertyId: params.propertyId, type: 'CASH', active: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!account) {
      account = await (tx as any).financialAccount.findFirst({
        where: { propertyId: params.propertyId, active: true },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!account) {
      account = await (tx as any).financialAccount.create({
        data: {
          propertyId: params.propertyId,
          name: 'Cash',
          type: 'CASH',
          openingBalance: 0,
        },
      })
    }
    accountId = account.id
    await (tx as any).paymentRecord.update({
      where: { id: params.paymentRecord.id },
      data: { financialAccountId: accountId },
    })
    params.paymentRecord.financialAccountId = accountId
  }

  let category = await (tx as any).financialCategory.findFirst({
    where: { propertyId: params.propertyId, code: 'RENT' },
  })
  if (!category) {
    category = await (tx as any).financialCategory.create({
      data: {
        propertyId: params.propertyId,
        type: 'INCOME',
        code: 'RENT',
        name: 'Sewa Kamar',
      },
    })
  } else if (category.type !== 'INCOME') {
    throw new AppError('Category RENT harus bertipe INCOME', 400)
  }

  const financialTransaction = await (tx as any).financialTransaction.create({
    data: {
      propertyId: params.propertyId,
      accountId: accountId!,
      categoryId: category.id,
      tenantId: params.pembayaran.penyewaId,
      pembayaranId: params.pembayaran.id,
      paymentRecordId: params.paymentRecord.id,
      type: 'INCOME',
      source: 'RENT_PAYMENT',
      amount: params.paymentRecord.amountPaid,
      transactionDate: params.paymentRecord.paymentDate,
      description: `Pembayaran sewa ${params.pembayaran.periodeBulan}/${params.pembayaran.periodeTahun}`,
      referenceNumber: params.paymentRecord.referenceNumber,
      createdByAdminId: params.adminId,
    },
  })

  return financialTransaction
}
