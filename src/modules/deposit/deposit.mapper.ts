import { toNumber, toNumberRequired } from '../../utils/serialize.util.js'

export function mapDeposit(row: any) {
  return {
    id: row.id,
    penyewaId: row.penyewaId,
    amountReceived: toNumberRequired(row.amountReceived),
    receivedDate: row.receivedDate.toISOString(),
    deductionAmount: toNumberRequired(row.deductionAmount),
    deductionReason: row.deductionReason || undefined,
    refundAmount: row.refundAmount != null ? toNumber(row.refundAmount) : undefined,
    refundDate: row.refundDate?.toISOString ? row.refundDate.toISOString() : undefined,
    status: row.status,
  }
}
