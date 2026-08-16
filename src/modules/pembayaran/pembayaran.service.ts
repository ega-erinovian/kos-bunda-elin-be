import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type {
  CreatePembayaranInput,
  PembayaranListQuery,
  UpdatePembayaranInput,
} from './pembayaran.schema.js'
import { Prisma, StatusPembayaran } from '@prisma/client'
import { startOfDay, endOfDay, subDays } from 'date-fns'

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

  // Auto-update status LUNAS jika tanggalBayar diisi dan status bukan LUNAS
  let finalStatus = input.status
  if (input.tanggalBayar && input.status !== StatusPembayaran.LUNAS) {
    finalStatus = StatusPembayaran.LUNAS
  }

  // Auto-set tanggalBayar = null jika status diubah ke BELUM_BAYAR/TERLAMBAT
  let finalTanggalBayar = input.tanggalBayar
  if (
    finalStatus &&
    (finalStatus === StatusPembayaran.BELUM_BAYAR ||
      finalStatus === StatusPembayaran.TERLAMBAT) &&
    input.tanggalBayar === undefined
  ) {
    finalTanggalBayar = null
  }

  return prisma.pembayaran.update({
    where: { id: current.id },
    data: {
      status: finalStatus,
      tanggalBayar: finalTanggalBayar,
      nominal: input.nominal,
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
