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

async function findPembayaranById(id: string) {
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
          kamar: { select: { nomor: true, lantai: true } },
        },
      },
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

  // Dynamic status queries
  if (query.status) {
    switch (query.status) {
      case 'akan_jatuh_tempo': {
        // H-3 sampai H (hari ini)
        const hMinus3 = startOfDay(subDays(today, 3))
        const h = endOfDay(today)
        where.tanggalJatuhTempo = { gte: hMinus3, lte: h }
        where.status = { in: ['BELUM_BAYAR', 'TERLAMBAT'] }
        break
      }
      case 'menunggak': {
        // Sudah lewat jatuh tempo (H+1 dst)
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
  const pembayaran = await findPembayaranById(id)
  if (!pembayaran) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }
  return pembayaran
}

export async function createPembayaran(input: CreatePembayaranInput) {
  const propertyId = getDefaultPropertyId()

  // Validasi penyewa exists dan dalam property yang sama
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

  // Cek duplikasi periode pembayaran untuk penyewa yang sama
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

  // Tentukan status awal berdasarkan tanggal jatuh tempo
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

  // Only allow updates to catatan and tanggalJatuhTempo
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

export async function markPembayaranLunas(id: string) {
  const current = await findPembayaranById(id)
  if (!current) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }

  if (current.status === StatusPembayaran.LUNAS) {
    throw new AppError('Pembayaran sudah lunas', 400)
  }

  return prisma.pembayaran.update({
    where: { id: current.id },
    data: {
      status: StatusPembayaran.LUNAS,
      tanggalBayar: new Date(),
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

export async function addPaymentRecord(
  pembayaranId: string,
  input: CreatePaymentRecordInput,
  adminId?: string
) {
  const propertyId = getDefaultPropertyId()

  return prisma.$transaction(async (tx) => {
    // 1. Lock and read the Pembayaran row
    const pembayaran = await tx.pembayaran.findFirst({
      where: {
        id: pembayaranId,
        penyewa: { kamar: { propertyId } },
      },
    })

    if (!pembayaran) {
      throw new AppError('Pembayaran tidak ditemukan', 404)
    }

    // 2. Insert the PaymentRecord
    const paymentRecord = await tx.paymentRecord.create({
      data: {
        pembayaranId: pembayaran.id,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        amountPaid: input.amountPaid,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        financialAccountId: input.financialAccountId,
        createdByAdminId: adminId,
      },
    })

    // 3. Recompute totalDibayar
    const newTotalDibayar = new Decimal(pembayaran.totalDibayar).plus(
      new Decimal(input.amountPaid)
    )

    // 4. Recompute status
    const newStatus = computePembayaranStatus(
      pembayaran.nominal,
      newTotalDibayar,
      pembayaran.tanggalJatuhTempo,
      new Date()
    )

    // 5. Update Pembayaran
    const updateData: Prisma.PembayaranUpdateInput = {
      totalDibayar: newTotalDibayar,
      status: newStatus,
    }

    // Set tanggalBayar when crossing the LUNAS threshold
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
            kamar: { select: { nomor: true } },
          },
        },
      },
    })

    // Check for overpayment and add warning flag
    const overpaid = isOverpayment(updatedPembayaran.nominal, newTotalDibayar)

    return {
      pembayaran: updatedPembayaran,
      paymentRecord,
      warning: overpaid ? 'overpaid' : undefined,
    }
  })
}

/**
 * Get payment history for a bill
 */
export async function getPaymentHistory(pembayaranId: string) {
  const propertyId = getDefaultPropertyId()

  // Verify bill exists and belongs to property
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
    },
  })
}
