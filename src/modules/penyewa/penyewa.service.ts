import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type {
  CreatePenyewaInput,
  KeluarPenyewaInput,
  PenyewaListQuery,
  UpdatePenyewaInput,
} from './penyewa.schema.js'
import { Prisma } from '@prisma/client'

async function findPenyewaById(id: string) {
  return prisma.penyewa.findFirst({
    where: { id, kamar: { propertyId: getDefaultPropertyId() } },
    include: {
      kamar: { select: { id: true, nomor: true, lantai: true, harga: true, status: true } },
    },
  })
}

export async function getPenyewaList(query: PenyewaListQuery) {
  const propertyId = getDefaultPropertyId()

  const where: Prisma.PenyewaWhereInput = { kamar: { propertyId } }
  if (query.aktif !== undefined) where.aktif = query.aktif
  if (query.search) {
    where.OR = [
      { nama: { contains: query.search, mode: 'insensitive' } },
      { noHp: { contains: query.search } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.penyewa.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        kamar: { select: { id: true, nomor: true, lantai: true, status: true } },
      },
    }),
    prisma.penyewa.count({ where }),
  ])

  return { data, total }
}

export async function getPenyewaById(id: string) {
  const penyewa = await findPenyewaById(id)
  if (!penyewa) {
    throw new AppError('Penyewa tidak ditemukan', 404)
  }
  return penyewa
}

export async function createPenyewa(input: CreatePenyewaInput) {
  const propertyId = getDefaultPropertyId()

  const kamar = await prisma.kamar.findFirst({
    where: { id: input.kamarId, propertyId },
  })
  if (!kamar) {
    throw new AppError('Kamar tidak ditemukan', 404)
  }
  if (kamar.status !== 'KOSONG') {
    throw new AppError('Kamar sudah terisi, pilih kamar lain', 400)
  }

  return prisma.$transaction(async (tx) => {
    const penyewa = await tx.penyewa.create({
      data: {
        nama: input.nama,
        noHp: input.noHp,
        kamarId: input.kamarId,
        tanggalMulaiSewa: input.tanggalMulaiSewa,
        nominalSewa: input.nominalSewa,
        tanggalJatuhTempo: input.tanggalJatuhTempo,
      },
    })
    await tx.kamar.update({
      where: { id: kamar.id },
      data: { status: 'TERISI' },
    })
    return penyewa
  })
}

export async function updatePenyewa(id: string, input: UpdatePenyewaInput) {
  const current = await findPenyewaById(id)
  if (!current) {
    throw new AppError('Penyewa tidak ditemukan', 404)
  }

  let moveToKamarId: string | undefined

  if (input.kamarId && input.kamarId !== current.kamarId) {
    const newKamar = await prisma.kamar.findFirst({
      where: { id: input.kamarId, propertyId: getDefaultPropertyId() },
    })
    if (!newKamar) {
      throw new AppError('Kamar tujuan tidak ditemukan', 404)
    }
    if (newKamar.status !== 'KOSONG') {
      throw new AppError('Kamar tujuan sudah terisi, pilih kamar lain', 400)
    }
    moveToKamarId = newKamar.id
  }

  return prisma.$transaction(async (tx) => {
    const penyewa = await tx.penyewa.update({
      where: { id: current.id },
      data: {
        nama: input.nama,
        noHp: input.noHp,
        kamarId: moveToKamarId,
        tanggalMulaiSewa: input.tanggalMulaiSewa,
        nominalSewa: input.nominalSewa,
        tanggalJatuhTempo: input.tanggalJatuhTempo,
      },
    })

    if (current.aktif && moveToKamarId) {
      await tx.kamar.update({
        where: { id: moveToKamarId },
        data: { status: 'TERISI' },
      })

      const otherActive = await tx.penyewa.count({
        where: { kamarId: current.kamarId, aktif: true, id: { not: current.id } },
      })
      if (otherActive === 0) {
        await tx.kamar.update({
          where: { id: current.kamarId },
          data: { status: 'KOSONG' },
        })
      }
    }

    return penyewa
  })
}

export async function keluarPenyewa(id: string, input: KeluarPenyewaInput) {
  const current = await findPenyewaById(id)
  if (!current) {
    throw new AppError('Penyewa tidak ditemukan', 404)
  }

  const tanggalKeluar = input.tanggalKeluar ?? new Date()

  return prisma.$transaction(async (tx) => {
    const penyewa = await tx.penyewa.update({
      where: { id: current.id },
      data: { tanggalKeluar, aktif: false },
    })

    const otherActive = await tx.penyewa.count({
      where: { kamarId: current.kamarId, aktif: true, id: { not: current.id } },
    })
    if (otherActive === 0) {
      await tx.kamar.update({
        where: { id: current.kamarId },
        data: { status: 'KOSONG' },
      })
    }

    return penyewa
  })
}