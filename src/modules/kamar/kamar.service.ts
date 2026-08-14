import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type { CreateKamarInput, KamarListQuery, UpdateKamarInput } from './kamar.schema.js'
import { Prisma } from '@prisma/client'

async function findKamarById(id: string, propertyId: string) {
  return prisma.kamar.findFirst({
    where: { id, propertyId },
    include: { _count: { select: { penyewa: true } } },
  })
}

async function assertNomorAvailable(
  nomor: string,
  propertyId: string,
  excludeId?: string,
) {
  const existing = await prisma.kamar.findUnique({
    where: { propertyId_nomor: { propertyId, nomor } },
  })
  if (existing && existing.id !== excludeId) {
    throw new AppError('Nomor kamar sudah terdaftar', 409)
  }
}

export async function getKamarList(query: KamarListQuery) {
  const propertyId = getDefaultPropertyId()

  const where: Prisma.KamarWhereInput = { propertyId }
  if (query.status) where.status = query.status
  if (query.search) {
    where.nomor = { contains: query.search, mode: 'insensitive' }
  }

  const [data, total] = await Promise.all([
    prisma.kamar.findMany({
      where,
      orderBy: { nomor: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        _count: { select: { penyewa: true } },
        penyewa: {
          where: { aktif: true },
          select: { id: true, nama: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.kamar.count({ where }),
  ])

  return { data, total }
}

export async function getKamarById(id: string) {
  const kamar = await findKamarById(id, getDefaultPropertyId())
  if (!kamar) {
    throw new AppError('Kamar tidak ditemukan', 404)
  }
  return kamar
}

export async function createKamar(input: CreateKamarInput) {
  const propertyId = getDefaultPropertyId()
  await assertNomorAvailable(input.nomor, propertyId)

  return prisma.kamar.create({
    data: {
      nomor: input.nomor,
      lantai: input.lantai,
      harga: input.harga,
      status: input.status,
      propertyId,
    },
  })
}

export async function updateKamar(id: string, input: UpdateKamarInput) {
  const propertyId = getDefaultPropertyId()
  const kamar = await findKamarById(id, propertyId)
  if (!kamar) {
    throw new AppError('Kamar tidak ditemukan', 404)
  }

  if (input.nomor && input.nomor !== kamar.nomor) {
    await assertNomorAvailable(input.nomor, propertyId, kamar.id)
  }

  if (
    input.status &&
    input.status !== kamar.status &&
    input.status !== 'TERISI' &&
    kamar._count.penyewa > 0
  ) {
    throw new AppError('Kamar masih terisi penyewa, tidak bisa diubah ke status ini', 400)
  }

  return prisma.kamar.update({
    where: { id: kamar.id },
    data: {
      nomor: input.nomor,
      lantai: input.lantai,
      harga: input.harga,
      status: input.status,
    },
  })
}

export async function deleteKamar(id: string) {
  const kamar = await findKamarById(id, getDefaultPropertyId())
  if (!kamar) {
    throw new AppError('Kamar tidak ditemukan', 404)
  }
  if (kamar._count.penyewa > 0) {
    throw new AppError('Kamar masih memiliki riwayat penyewa, tidak bisa dihapus', 400)
  }

  return prisma.kamar.delete({ where: { id: kamar.id } })
}