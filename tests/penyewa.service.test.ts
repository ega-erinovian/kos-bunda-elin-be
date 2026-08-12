import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  getPenyewaList,
  getPenyewaById,
  createPenyewa,
  updatePenyewa,
  keluarPenyewa,
} from '../src/modules/penyewa/penyewa.service.js'
import prisma from '../src/config/prisma.js'

jest.mock('../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    penyewa: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    kamar: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('../src/config/property.js', () => ({
  getDefaultPropertyId: jest.fn(() => 'property-1'),
}))

type MockFn = ReturnType<typeof jest.fn>

const prismaMock = prisma as unknown as {
  penyewa: { findFirst: MockFn; findMany: MockFn; count: MockFn }
  kamar: { findFirst: MockFn; update: MockFn }
  $transaction: MockFn
}

const mockTx = {
  penyewa: { create: jest.fn() as MockFn, update: jest.fn() as MockFn, count: jest.fn() as MockFn },
  kamar: { update: jest.fn() as MockFn },
}

const penyewaDummy = {
  id: 'penyewa-1',
  nama: 'Budi',
  noHp: '6281234567890',
  kamarId: 'kamar-1',
  aktif: true,
  kamar: { id: 'kamar-1', nomor: '1A', lantai: '1', status: 'TERISI' },
}

describe('penyewa.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn) => fn(mockTx))
  })

  describe('getPenyewaList', () => {
    it('mengembalikan daftar penyewa dengan pagination', async () => {
      prismaMock.penyewa.findMany.mockResolvedValue([penyewaDummy])
      prismaMock.penyewa.count.mockResolvedValue(1)

      const result = await getPenyewaList({ page: 2, limit: 10 })

      expect(prismaMock.penyewa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kamar: { propertyId: 'property-1' } },
          orderBy: { createdAt: 'desc' },
          skip: 10,
          take: 10,
        }),
      )
      expect(prismaMock.penyewa.count).toHaveBeenCalledWith({
        where: { kamar: { propertyId: 'property-1' } },
      })
      expect(result).toEqual({ data: [penyewaDummy], total: 1 })
    })

    it('memfilter berdasarkan aktif', async () => {
      prismaMock.penyewa.findMany.mockResolvedValue([])
      prismaMock.penyewa.count.mockResolvedValue(0)

      await getPenyewaList({ page: 1, limit: 20, aktif: false })

      expect(prismaMock.penyewa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { kamar: { propertyId: 'property-1' }, aktif: false } }),
      )
    })

    it('mencari berdasarkan nama atau noHp', async () => {
      prismaMock.penyewa.findMany.mockResolvedValue([])
      prismaMock.penyewa.count.mockResolvedValue(0)

      await getPenyewaList({ page: 1, limit: 20, search: 'budi' })

      expect(prismaMock.penyewa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            kamar: { propertyId: 'property-1' },
            OR: [
              { nama: { contains: 'budi', mode: 'insensitive' } },
              { noHp: { contains: 'budi' } },
            ],
          },
        }),
      )
    })
  })

  describe('getPenyewaById', () => {
    it('mengembalikan penyewa yang ditemukan', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(penyewaDummy)

      const result = await getPenyewaById('penyewa-1')

      expect(prismaMock.penyewa.findFirst).toHaveBeenCalledWith({
        where: { id: 'penyewa-1', kamar: { propertyId: 'property-1' } },
        include: expect.objectContaining({ kamar: expect.any(Object) }),
      })
      expect(result).toEqual(penyewaDummy)
    })

    it('melempar 404 saat penyewa tidak ditemukan', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(null)

      await expect(getPenyewaById('tidak-ada')).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('createPenyewa', () => {
    const input = {
      nama: 'Budi',
      noHp: '6281234567890',
      kamarId: 'kamar-1',
      tanggalMulaiSewa: new Date('2026-01-01'),
      nominalSewa: 750000,
      tanggalJatuhTempo: 5,
    }

    it('melempar 404 saat kamar tidak ditemukan', async () => {
      prismaMock.kamar.findFirst.mockResolvedValue(null)

      await expect(createPenyewa(input)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('melempar 400 saat kamar sudah terisi', async () => {
      prismaMock.kamar.findFirst.mockResolvedValue({ id: 'kamar-1', status: 'TERISI' })

      await expect(createPenyewa(input)).rejects.toMatchObject({ statusCode: 400 })
    })

    it('membuat penyewa dan mengubah status kamar menjadi TERISI', async () => {
      prismaMock.kamar.findFirst.mockResolvedValue({ id: 'kamar-1', status: 'KOSONG' })
      mockTx.penyewa.create.mockResolvedValue(penyewaDummy)
      mockTx.kamar.update.mockResolvedValue({ id: 'kamar-1', status: 'TERISI' })

      const result = await createPenyewa(input)

      expect(mockTx.penyewa.create).toHaveBeenCalledWith({
        data: {
          nama: input.nama,
          noHp: input.noHp,
          kamarId: 'kamar-1',
          tanggalMulaiSewa: input.tanggalMulaiSewa,
          nominalSewa: input.nominalSewa,
          tanggalJatuhTempo: input.tanggalJatuhTempo,
        },
      })
      expect(mockTx.kamar.update).toHaveBeenCalledWith({
        where: { id: 'kamar-1' },
        data: { status: 'TERISI' },
      })
      expect(result).toEqual(penyewaDummy)
    })
  })

  describe('updatePenyewa', () => {
    const current = { id: 'penyewa-1', kamarId: 'kamar-1', aktif: true }

    it('melempar 404 saat penyewa tidak ditemukan', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(null)

      await expect(updatePenyewa('penyewa-1', { nama: 'Budi' })).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('memperbarui data tanpa pindah kamar', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      mockTx.penyewa.update.mockResolvedValue({ ...penyewaDummy, nama: 'Budiman' })

      const result = await updatePenyewa('penyewa-1', { nama: 'Budiman', noHp: '6281234567890' })

      expect(mockTx.penyewa.update).toHaveBeenCalledWith({
        where: { id: 'penyewa-1' },
        data: expect.objectContaining({ nama: 'Budiman' }),
      })
      expect(mockTx.kamar.update).not.toHaveBeenCalled()
      expect(result.nama).toBe('Budiman')
    })

    it('melempar 404 saat kamar tujuan tidak ditemukan', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      prismaMock.kamar.findFirst.mockResolvedValue(null)

      await expect(updatePenyewa('penyewa-1', { kamarId: 'kamar-2' })).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('melempar 400 saat kamar tujuan sudah terisi', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      prismaMock.kamar.findFirst.mockResolvedValue({ id: 'kamar-2', status: 'TERISI' })

      await expect(updatePenyewa('penyewa-1', { kamarId: 'kamar-2' })).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('pindah kamar dan mengosongkan kamar lama jika tidak ada penghuni aktif lain', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      prismaMock.kamar.findFirst.mockResolvedValue({ id: 'kamar-2', status: 'KOSONG' })
      mockTx.penyewa.update.mockResolvedValue({ id: 'penyewa-1', kamarId: 'kamar-2' })
      mockTx.penyewa.count.mockResolvedValue(0)

      const result = await updatePenyewa('penyewa-1', { kamarId: 'kamar-2' })

      expect(mockTx.kamar.update).toHaveBeenCalledWith({
        where: { id: 'kamar-2' },
        data: { status: 'TERISI' },
      })
      expect(mockTx.kamar.update).toHaveBeenCalledWith({
        where: { id: 'kamar-1' },
        data: { status: 'KOSONG' },
      })
      expect(mockTx.penyewa.count).toHaveBeenCalledWith({
        where: { kamarId: 'kamar-1', aktif: true, id: { not: 'penyewa-1' } },
      })
      expect(result.kamarId).toBe('kamar-2')
    })

    it('pindah kamar dan mempertahankan kamar lama jika masih ada penghuni aktif', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      prismaMock.kamar.findFirst.mockResolvedValue({ id: 'kamar-2', status: 'KOSONG' })
      mockTx.penyewa.update.mockResolvedValue({ id: 'penyewa-1', kamarId: 'kamar-2' })
      mockTx.penyewa.count.mockResolvedValue(1)

      await updatePenyewa('penyewa-1', { kamarId: 'kamar-2' })

      expect(mockTx.kamar.update).toHaveBeenCalledTimes(1)
      expect(mockTx.kamar.update).toHaveBeenCalledWith({
        where: { id: 'kamar-2' },
        data: { status: 'TERISI' },
      })
    })
  })

  describe('keluarPenyewa', () => {
    const current = { id: 'penyewa-1', kamarId: 'kamar-1', aktif: true }

    it('melempar 404 saat penyewa tidak ditemukan', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(null)

      await expect(keluarPenyewa('penyewa-1', {})).rejects.toMatchObject({ statusCode: 404 })
    })

    it('menandai penyewa keluar dan mengosongkan kamar', async () => {
      const tanggalKeluar = new Date('2026-08-01')
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      mockTx.penyewa.update.mockResolvedValue({ id: 'penyewa-1', aktif: false })
      mockTx.penyewa.count.mockResolvedValue(0)

      const result = await keluarPenyewa('penyewa-1', { tanggalKeluar })

      expect(mockTx.penyewa.update).toHaveBeenCalledWith({
        where: { id: 'penyewa-1' },
        data: { tanggalKeluar, aktif: false },
      })
      expect(mockTx.kamar.update).toHaveBeenCalledWith({
        where: { id: 'kamar-1' },
        data: { status: 'KOSONG' },
      })
      expect(result.aktif).toBe(false)
    })

    it('memakai tanggal hari ini jika tanggalKeluar tidak dikirim', async () => {
      prismaMock.penyewa.findFirst.mockResolvedValue(current)
      mockTx.penyewa.update.mockResolvedValue({ id: 'penyewa-1', aktif: false })
      mockTx.penyewa.count.mockResolvedValue(1)

      await keluarPenyewa('penyewa-1', {})

      const updateCall = mockTx.penyewa.update.mock.calls[0][0]
      expect(updateCall.data.tanggalKeluar).toBeInstanceOf(Date)
      expect(updateCall.data.aktif).toBe(false)
      expect(mockTx.kamar.update).not.toHaveBeenCalled()
    })
  })
})
