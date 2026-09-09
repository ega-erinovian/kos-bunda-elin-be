import { toNumberRequired } from '../../utils/serialize.util.js'

export function mapFinancialTransaction(t: any) {
  return {
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    tenantId: t.tenantId || undefined,
    pembayaranId: t.pembayaranId || undefined,
    paymentRecordId: t.paymentRecordId || undefined,
    depositId: t.depositId || undefined,
    type: t.type,
    source: t.source,
    amount: toNumberRequired(t.amount),
    transactionDate: t.transactionDate.toISOString(),
    description: t.description || undefined,
    referenceNumber: t.referenceNumber || undefined,
    vendorName: t.vendorName || undefined,
    receiptUrl: t.receiptUrl || undefined,
    createdAt: t.createdAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString ? t.deletedAt.toISOString() : undefined,
  }
}
