import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type {
  CreatePembayaranInput,
  PembayaranListQuery,
  UpdatePembayaranInput,
  CreatePaymentRecordInput,
} from './pembayaran.schema.js'
import { Prisma, StatusPembayaran } from '@prisma/client'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { computePembayaranStatus, isOverpayment } from '../../utils/paymentStatus.util.js'
import { Decimal } from 'decimal.js'
import crypto from 'crypto'
import { writeAuditLog } from '../audit/audit.service.js'
import { createTransactionForPayment } from '../finance/finance-integration.service.js'

async function findPembayaranById(id: string, includePaymentRecords = false) {
  return prisma.pembayaran.findFirst({
    where: {
      id,
      penyewa: { kamar: { propertyId: getDefaultPropertyId() } },
    },
    include: {
      penyewa: {
        select: {
          id: true,
          nama: true,
          noHp: true,
          kamar: { select: { id: true, nomor: true, lantai: true } },
        },
      },
      paymentRecords: includePaymentRecords
        ? {
            orderBy: { paymentDate: 'asc' },
            include: {
              createdByAdmin: {
                select: { id: true, nama: true },
              },
              financialTransaction: true,
            },
          }
        : false,
    },
  })
}

export async function getPembayaranList(query: PembayaranListQuery) {
  const propertyId = getDefaultPropertyId()
  const today = startOfDay(new Date())

  const where: Prisma.PembayaranWhereInput = {
    penyewa: { kamar: { propertyId }, aktif: true },
  }

  if (query.penyewaId) {
    where.penyewaId = query.penyewaId
  }

  if (query.periodeBulan) {
    where.periodeBulan = query.periodeBulan
  }

  if (query.periodeTahun) {
    where.periodeTahun = query.periodeTahun
  }

  if (query.status) {
    switch (query.status) {
      case 'akan_jatuh_tempo': {
        const hMinus3 = startOfDay(subDays(today, 3))
        const h = endOfDay(today)
        where.tanggalJatuhTempo = { gte: hMinus3, lte: h }
        where.status = { in: ['BELUM_BAYAR', 'TERLAMBAT'] }
        break
      }
      case 'menunggak': {
        where.tanggalJatuhTempo = { lt: today }
        where.status = { in: ['BELUM_BAYAR', 'TERLAMBAT'] }
        break
      }
      case 'sebagian':
        where.status = StatusPembayaran.SEBAGIAN
        break
      case 'belum_bayar':
        where.status = StatusPembayaran.BELUM_BAYAR
        break
      case 'lunas':
        where.status = StatusPembayaran.LUNAS
        break
      case 'terlambat':
        where.status = StatusPembayaran.TERLAMBAT
        break
    }
  }

  const [data, total] = await Promise.all([
    prisma.pembayaran.findMany({
      where,
      orderBy: [{ tanggalJatuhTempo: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        penyewa: {
          select: {
            id: true,
            nama: true,
            noHp: true,
            kamar: { select: { id: true, nomor: true, lantai: true } },
          },
        },
      },
    }),
    prisma.pembayaran.count({ where }),
  ])

  return { data, total }
}

export async function getPembayaranById(id: string) {
  const pembayaran = await findPembayaranById(id, true)
  if (!pembayaran) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }
  return pembayaran
}

export async function createPembayaran(input: CreatePembayaranInput) {
  const propertyId = getDefaultPropertyId()

  const penyewa = await prisma.penyewa.findFirst({
    where: {
      id: input.penyewaId,
      kamar: { propertyId },
      aktif: true,
    },
  })

  if (!penyewa) {
    throw new AppError('Penyewa tidak ditemukan atau tidak aktif', 404)
  }

  const existing = await prisma.pembayaran.findUnique({
    where: {
      penyewaId_periodeBulan_periodeTahun: {
        penyewaId: input.penyewaId,
        periodeBulan: input.periodeBulan,
        periodeTahun: input.periodeTahun,
      },
    },
  })

  if (existing) {
    throw new AppError(
      `Pembayaran untuk periode ${input.periodeBulan}/${input.periodeTahun} sudah ada`,
      409,
    )
  }

  const today = startOfDay(new Date())
  const jatuhTempo = startOfDay(input.tanggalJatuhTempo)
  let status: StatusPembayaran = StatusPembayaran.BELUM_BAYAR

  if (jatuhTempo < today) {
    status = StatusPembayaran.TERLAMBAT
  }

  return prisma.pembayaran.create({
    data: {
      penyewaId: input.penyewaId,
      periodeBulan: input.periodeBulan,
      periodeTahun: input.periodeTahun,
      tanggalJatuhTempo: jatuhTempo,
      nominal: input.nominal,
      catatan: input.catatan,
      status,
    },
    include: {
      penyewa: {
        select: {
          id: true,
          nama: true,
          kamar: { select: { nomor: true } },
        },
      },
    },
  })
}

export async function updatePembayaran(id: string, input: UpdatePembayaranInput) {
  const current = await findPembayaranById(id)
  if (!current) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }

  return prisma.pembayaran.update({
    where: { id: current.id },
    data: {
      tanggalJatuhTempo: input.tanggalJatuhTempo,
      catatan: input.catatan,
    },
    include: {
      penyewa: {
        select: {
          id: true,
          nama: true,
          kamar: { select: { nomor: true } },
        },
      },
    },
  })
}

/**
 * Generate idempotency key from request headers or derive deterministic fallback
 */
function getIdempotencyKey(
  headerKey: string | undefined,
  pembayaranId: string,
  input: CreatePaymentRecordInput
): string {
  if (headerKey) {
    return headerKey
  }

  const payload = JSON.stringify({
    pembayaranId,
    amountPaid: input.amountPaid.toString(),
    paymentDate: input.paymentDate.toISOString(),
    referenceNumber: input.referenceNumber || '',
  })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function addPaymentRecord(
  pembayaranId: string,
  input: CreatePaymentRecordInput,
  adminId?: string,
  idempotencyKeyHeader?: string
) {
  const propertyId = getDefaultPropertyId()
  const idempotencyKey = getIdempotencyKey(idempotencyKeyHeader, pembayaranId, input)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentRecord.findUnique({
      where: { idempotencyKey },
      include: {
        pembayaran: {
          include: {
            penyewa: {
              select: {
                id: true,
                nama: true,
                kamar: { select: { id: true, nomor: true } },
              },
            },
          },
        },
        createdByAdmin: {
          select: { id: true, nama: true },
        },
        financialTransaction: true,
      },
    })

    if (existing) {
      const overpaid = isOverpayment(
        existing.pembayaran.nominal,
        existing.pembayaran.totalDibayar
      )
      return {
        pembayaran: existing.pembayaran,
        paymentRecord: existing,
        financialTransaction: (existing as any).financialTransaction,
        warning: overpaid ? ('overpaid' as const) : undefined,
        isReplay: true,
      }
    }

    const pembayaran = await tx.pembayaran.findFirst({
      where: {
        id: pembayaranId,
        penyewa: { kamar: { propertyId } },
      },
    })

    if (!pembayaran) {
      throw new AppError('Pembayaran tidak ditemukan', 404)
    }

    if (input.financialAccountId) {
      const accountCheck = await (tx as any).financialAccount.findFirst({
        where: { id: input.financialAccountId, propertyId },
      })
      if (!accountCheck) throw new AppError('FinancialAccount tidak ditemukan', 404)
    }

    const paymentRecord = await tx.paymentRecord.create({
      data: {
        pembayaranId: pembayaran.id,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        amountPaid: input.amountPaid,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        financialAccountId: input.financialAccountId,
        idempotencyKey,
        createdByAdminId: adminId,
      },
      include: {
        createdByAdmin: {
          select: { id: true, nama: true },
        },
        financialTransaction: true,
      },
    })

    const newTotalDibayar = new Decimal(pembayaran.totalDibayar as any).plus(
      new Decimal(input.amountPaid as any)
    )

    const newStatus = computePembayaranStatus(
      pembayaran.nominal as any,
      newTotalDibayar,
      pembayaran.tanggalJatuhTempo,
      new Date()
    )

    const updateData: Prisma.PembayaranUpdateInput = {
      totalDibayar: newTotalDibayar as any,
      status: newStatus,
    }

    if (
      newStatus === StatusPembayaran.LUNAS &&
      pembayaran.status !== StatusPembayaran.LUNAS
    ) {
      updateData.tanggalBayar = input.paymentDate
    }

    const updatedPembayaran = await tx.pembayaran.update({
      where: { id: pembayaran.id },
      data: updateData,
      include: {
        penyewa: {
          select: {
            id: true,
            nama: true,
            kamar: { select: { id: true, nomor: true } },
          },
        },
      },
    })

    const financialTransaction = await createTransactionForPayment(tx as any, {
      propertyId,
      paymentRecord,
      pembayaran: updatedPembayaran,
      adminId,
    })

    await writeAuditLog(tx as any, {
      propertyId,
      adminId,
      entity: 'Pembayaran',
      entityId: pembayaran.id,
      action: 'PAYMENT_RECORDED',
      afterValue: {
        pembayaran: updatedPembayaran,
        paymentRecord,
        financialTransaction,
      },
    })

    const overpaid = isOverpayment(updatedPembayaran.nominal as any, newTotalDibayar)

    const paymentRecordWithTx = { ...paymentRecord, financialTransaction }

    return {
      pembayaran: updatedPembayaran,
      paymentRecord: paymentRecordWithTx,
      financialTransaction,
      warning: overpaid ? ('overpaid' as const) : undefined,
      isReplay: false,
    }
  })
}

/**
 * Get payment history for a bill
 */
export async function getPaymentHistory(pembayaranId: string) {
  const propertyId = getDefaultPropertyId()

  const pembayaran = await prisma.pembayaran.findFirst({
    where: {
      id: pembayaranId,
      penyewa: { kamar: { propertyId } },
    },
  })

  if (!pembayaran) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }

  return prisma.paymentRecord.findMany({
    where: { pembayaranId },
    orderBy: { paymentDate: 'asc' },
    include: {
      createdByAdmin: {
        select: {
          id: true,
          nama: true,
          email: true,
        },
      },
      financialTransaction: true,
    },
  })
}
