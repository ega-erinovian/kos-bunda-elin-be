import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import { addDays, isBefore, startOfDay, endOfDay } from 'date-fns'
import { Prisma } from '@prisma/client'
import type {
  CreatePembayaranInput,
  PembayaranListQuery,
  UpdatePembayaranInput,
} from './pembayaran.schema.js'

const H_MINUS_MAKSIMAL = 3

const includePenyewa = {
  penyewa: {
    select: {
      id: true,
      nama: true,
      noHp: true,
      kamar: { select: { id: true, nomor: true } },
    },
  },
} satisfies Prisma.PembayaranInclude

async function findPembayaranById(id: string) {
  return prisma.pembayaran.findFirst({
    where: { id, penyewa: { kamar: { propertyId: getDefaultPropertyId() } } },
    include: includePenyewa,
  })
}

async function assertPeriodeAvailable(
  penyewaId: string,
  periodeBulan: number,
  periodeTahun: number,
  excludeId?: string,
) {
  const existing = await prisma.pembayaran.findUnique({
    where: {
      penyewaId_periodeBulan_periodeTahun: {
        penyewaId,
        periodeBulan,
        periodeTahun,
      },
    },
  })
  if (existing && existing.id !== excludeId) {
    throw new AppError('Pembayaran untuk periode tersebut sudah tercatat', 409)
  }
}

function hitungTanggalJatuhTempo(hari: number, tahun: number, bulan: number): Date {
  const hariTerakhir = new Date(tahun, bulan, 0).getDate()
  return new Date(tahun, bulan - 1, Math.min(hari, hariTerakhir))
}

export async function getPembayaranList(query: PembayaranListQuery) {
  const propertyId = getDefaultPropertyId()
  const todayStart = startOfDay(new Date())

  const where: Prisma.PembayaranWhereInput = {
    penyewa: { kamar: { propertyId } },
  }

  if (query.status === 'akan_jatuh_tempo') {
    where.status = { in: ['BELUM_BAYAR', 'TERLAMBAT'] }
    where.tanggalJatuhTempo = {
      gte: todayStart,
      lte: endOfDay(addDays(todayStart, H_MINUS_MAKSIMAL)),
    }
  } else if (query.status === 'menunggak') {
    where.status = { in: ['BELUM_BAYAR', 'TERLAMBAT'] }
    where.tanggalJatuhTempo = { lt: todayStart }
  } else if (query.status) {
    where.status = query.status
  }

  if (query.penyewaId) where.penyewaId = query.penyewaId
  if (query.periodeBulan) where.periodeBulan = query.periodeBulan
  if (query.periodeTahun) where.periodeTahun = query.periodeTahun
  if (query.search) {
    where.penyewa = {
      kamar: { propertyId },
      nama: { contains: query.search, mode: 'insensitive' },
    }
  }

  const isFilterTanggal = query.status === 'akan_jatuh_tempo' || query.status === 'menunggak'
  const [data, total] = await Promise.all([
    prisma.pembayaran.findMany({
      where,
      orderBy: isFilterTanggal ? { tanggalJatuhTempo: 'asc' } : { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: includePenyewa,
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
  const penyewa = await prisma.penyewa.findFirst({
    where: { id: input.penyewaId, kamar: { propertyId: getDefaultPropertyId() } },
  })
  if (!penyewa) {
    throw new AppError('Penyewa tidak ditemukan', 404)
  }

  await assertPeriodeAvailable(input.penyewaId, input.periodeBulan, input.periodeTahun)

  const tanggalJatuhTempo =
    input.tanggalJatuhTempo ??
    hitungTanggalJatuhTempo(penyewa.tanggalJatuhTempo, input.periodeTahun, input.periodeBulan)

  const status = input.status
    ? input.status
    : isBefore(tanggalJatuhTempo, startOfDay(new Date()))
      ? 'TERLAMBAT'
      : 'BELUM_BAYAR'

  return prisma.pembayaran.create({
    data: {
      penyewa: { connect: { id: input.penyewaId } },
      periodeBulan: input.periodeBulan,
      periodeTahun: input.periodeTahun,
      tanggalJatuhTempo,
      status,
      tanggalBayar: status === 'LUNAS' ? (input.tanggalBayar ?? new Date()) : null,
      nominal: input.nominal ?? Number(penyewa.nominalSewa),
      catatan: input.catatan,
    },
  })
}

export async function updatePembayaran(id: string, input: UpdatePembayaranInput) {
  const current = await findPembayaranById(id)
  if (!current) {
    throw new AppError('Pembayaran tidak ditemukan', 404)
  }

  const penyewaId = input.penyewaId ?? current.penyewaId
  const periodeBulan = input.periodeBulan ?? current.periodeBulan
  const periodeTahun = input.periodeTahun ?? current.periodeTahun

  if (
    penyewaId !== current.penyewaId ||
    periodeBulan !== current.periodeBulan ||
    periodeTahun !== current.periodeTahun
  ) {
    await assertPeriodeAvailable(penyewaId, periodeBulan, periodeTahun, current.id)
  }

  if (input.penyewaId) {
    const penyewa = await prisma.penyewa.findFirst({
      where: { id: input.penyewaId, kamar: { propertyId: getDefaultPropertyId() } },
    })
    if (!penyewa) {
      throw new AppError('Penyewa tidak ditemukan', 404)
    }
  }

  let tanggalBayar = current.tanggalBayar
  if (input.status === 'LUNAS') {
    tanggalBayar = input.tanggalBayar ?? new Date()
  } else if (input.status) {
    tanggalBayar = null
  } else if ('tanggalBayar' in input) {
    tanggalBayar = input.tanggalBayar ?? null
  }

  return prisma.pembayaran.update({
    where: { id: current.id },
    data: {
      penyewaId: input.penyewaId,
      periodeBulan: input.periodeBulan,
      periodeTahun: input.periodeTahun,
      tanggalJatuhTempo: input.tanggalJatuhTempo,
      status: input.status,
      tanggalBayar,
      nominal: input.nominal,
      catatan: input.catatan,
    },
  })
}