import { Pembayaran, PaymentRecord, Penyewa, Kamar, Admin } from '@prisma/client'
import { toNumber, toNumberRequired } from '../../utils/serialize.util.js'

type PembayaranResponse = {
  id: string
  penyewaId: string
  penyewa: {
    id: string
    nama: string
    noHp: string
    kamar: {
      id: string
      nomor: string
      lantai: string | null
    }
  }
  periodeBulan: number
  periodeTahun: number
  tanggalJatuhTempo: string
  status: string
  tanggalBayar: string | null
  nominal: number
  totalDibayar: number
  catatan: string | null
  createdAt: string
  updatedAt: string
  paymentRecords?: any[]
}

type PaymentRecordResponse = {
  id: string
  pembayaranId: string
  paymentMethod: string
  paymentDate: string
  amountPaid: number
  referenceNumber: string | undefined
  notes: string | undefined
  financialAccountId: string | undefined
  financialTransactionId?: string
  createdByAdmin?: {
    id: string
    nama: string
  } | undefined
  createdAt: string
}

/**
 * Maps Pembayaran for list responses (no paymentRecords embedded)
 */
export function mapPembayaranList(pembayaran: any) {
  return {
    id: pembayaran.id,
    penyewaId: pembayaran.penyewaId,
    penyewa: {
      id: pembayaran.penyewa.id,
      nama: pembayaran.penyewa.nama,
      noHp: pembayaran.penyewa.noHp,
      kamar: {
        id: pembayaran.penyewa.kamar.id,
        nomor: pembayaran.penyewa.kamar.nomor,
        lantai: pembayaran.penyewa.kamar.lantai,
      },
    },
    periodeBulan: pembayaran.periodeBulan,
    periodeTahun: pembayaran.periodeTahun,
    tanggalJatuhTempo: pembayaran.tanggalJatuhTempo.toISOString(),
    status: pembayaran.status,
    tanggalBayar: pembayaran.tanggalBayar?.toISOString() || null,
    nominal: toNumberRequired(pembayaran.nominal),
    totalDibayar: toNumberRequired(pembayaran.totalDibayar),
    catatan: pembayaran.catatan,
    createdAt: pembayaran.createdAt.toISOString(),
    updatedAt: pembayaran.updatedAt.toISOString(),
  }
}

/**
 * Maps Pembayaran for detail responses (WITH paymentRecords embedded)
 * §1 item 4: paymentRecords embedded on DETAIL fetch only
 */
export function mapPembayaranDetail(pembayaran: any) {
  const base = mapPembayaranList(pembayaran)
  
  return {
    ...base,
    paymentRecords: pembayaran.paymentRecords
      ? pembayaran.paymentRecords.map(mapPaymentRecord)
      : [],
  }
}

/**
 * Maps PaymentRecord response
 * §1 item 5: projects financialTransactionId once Phase 12 links it
 * §1 item 7: converts Decimal to number
 */
export function mapPaymentRecord(record: any) {
  const financialTransactionId =
    record.financialTransaction?.id || record.financialTransactionId || undefined
  return {
    id: record.id,
    pembayaranId: record.pembayaranId,
    paymentMethod: record.paymentMethod,
    paymentDate: record.paymentDate.toISOString(),
    amountPaid: toNumberRequired(record.amountPaid),
    referenceNumber: record.referenceNumber || undefined,
    notes: record.notes || undefined,
    financialAccountId: record.financialAccountId || undefined,
    financialTransactionId,
    createdByAdmin: record.createdByAdmin && typeof record.createdByAdmin === 'object'
      ? {
          id: record.createdByAdmin.id,
          nama: record.createdByAdmin.nama,
        }
      : undefined,
    createdAt: record.createdAt.toISOString(),
  }
}

/**
 * Maps the addPaymentRecord response (includes pembayaran summary + paymentRecord + warning)
 */
export function mapAddPaymentRecordResponse(result: {
  pembayaran: any
  paymentRecord: any
  warning?: 'overpaid'
}) {
  return {
    paymentRecord: mapPaymentRecord(result.paymentRecord),
    pembayaran: {
      id: result.pembayaran.id,
      status: result.pembayaran.status,
      totalDibayar: toNumberRequired(result.pembayaran.totalDibayar),
      tanggalBayar: result.pembayaran.tanggalBayar?.toISOString() || null,
    },
    warning: result.warning,
  }
}
