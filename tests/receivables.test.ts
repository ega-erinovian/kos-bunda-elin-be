import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/app.js'
import prisma from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { addDays, subDays, startOfDay } from 'date-fns'
import { bucketLabel, bucketAging } from '../src/utils/aging.util.js'

async function loginAsOwner(): Promise<{ token: string; propertyId: string }> {
  const admin = await prisma.admin.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } })
  if (!admin) throw new Error(`admin not found ${env.SEED_ADMIN_EMAIL}`)
  const token = jwt.sign({ adminId: admin.id, role: admin.role, propertyId: admin.propertyId }, env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
  return { token, propertyId: admin.propertyId }
}

describe('Receivables - Phase 14', () => {
  let token: string
  let propertyId: string
  const PREFIX = 'RCV-TEST-'

  beforeAll(async () => {
    const owner = await loginAsOwner()
    token = owner.token
    propertyId = owner.propertyId
  })

  afterAll(async () => {
    await prisma.paymentRecord.deleteMany({ where: { pembayaran: { penyewa: { kamar: { propertyId }, nama: { startsWith: PREFIX } } } } })
    await prisma.pembayaran.deleteMany({ where: { penyewa: { kamar: { propertyId }, nama: { startsWith: PREFIX } } } })
    await prisma.penyewa.deleteMany({ where: { nama: { startsWith: PREFIX } } })
    await prisma.kamar.deleteMany({ where: { nomor: { startsWith: PREFIX } } })
    await prisma.$disconnect()
  })

  describe('aging util unit', () => {
    it('bucket boundaries', () => {
      expect(bucketLabel(0)).toBe('current')
      expect(bucketLabel(-5)).toBe('current')
      expect(bucketLabel(1)).toBe('1-30')
      expect(bucketLabel(30)).toBe('1-30')
      expect(bucketLabel(31)).toBe('31-60')
      expect(bucketLabel(60)).toBe('31-60')
      expect(bucketLabel(61)).toBe('61-90')
      expect(bucketLabel(90)).toBe('61-90')
      expect(bucketLabel(91)).toBe('90+')
      expect(bucketLabel(200)).toBe('90+')
    })

    it('bucketAging always returns 5 buckets', () => {
      const buckets = bucketAging([])
      expect(buckets).toHaveLength(5)
      expect(buckets.map((b) => b.label)).toEqual(['current', '1-30', '31-60', '61-90', '90+'])
      for (const b of buckets) {
        expect(typeof b.outstanding).toBe('number')
        expect(typeof b.count).toBe('number')
      }
    })
  })

  describe('GET /api/receivables', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/receivables')
      expect(res.status).toBe(401)
    })

    it('lists by tenant with number types', async () => {
      const res = await request(app).get('/api/receivables').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      for (const row of res.body.data) {
        expect(typeof row.penyewaId).toBe('string')
        expect(typeof row.nama).toBe('string')
        expect(typeof row.outstanding).toBe('number')
        expect(typeof row.unpaidPeriods).toBe('number')
      }
    })

    it('summary propertyTotal alias and cross-check sums', async () => {
      const rList = await request(app).get('/api/receivables').set('Authorization', `Bearer ${token}`)
      const rSum = await request(app).get('/api/receivables/summary').set('Authorization', `Bearer ${token}`)
      expect(rSum.status).toBe(200)
      expect(typeof rSum.body.data.totalOutstanding).toBe('number')
      expect(typeof rSum.body.data.unpaidPeriodCount).toBe('number')
      expect(typeof rSum.body.data.propertyTotal).toBe('number')
      expect(rSum.body.data.propertyTotal).toBe(rSum.body.data.totalOutstanding)
      const sumOutstanding = rList.body.data.reduce((a: number, b: any) => a + b.outstanding, 0)
      const sumPeriods = rList.body.data.reduce((a: number, b: any) => a + b.unpaidPeriods, 0)
      expect(sumOutstanding).toBe(rSum.body.data.totalOutstanding)
      expect(sumPeriods).toBe(rSum.body.data.unpaidPeriodCount)
    })

    it('aging buckets shape and sums match summary', async () => {
      const rSum = await request(app).get('/api/receivables/summary').set('Authorization', `Bearer ${token}`)
      const rAging = await request(app).get('/api/receivables/aging').set('Authorization', `Bearer ${token}`)
      expect(rAging.status).toBe(200)
      const buckets = rAging.body.data.buckets
      expect(buckets).toHaveLength(5)
      expect(buckets.map((b: any) => b.label)).toEqual(['current', '1-30', '31-60', '61-90', '90+'])
      for (const b of buckets) {
        expect(typeof b.outstanding).toBe('number')
        expect(typeof b.count).toBe('number')
      }
      const sumOutstanding = buckets.reduce((a: number, b: any) => a + b.outstanding, 0)
      const sumCount = buckets.reduce((a: number, b: any) => a + b.count, 0)
      expect(sumOutstanding).toBe(rSum.body.data.totalOutstanding)
      expect(sumCount).toBe(rSum.body.data.unpaidPeriodCount)
    })

    it('rejects future asOf with 400', async () => {
      const tomorrow = addDays(new Date(), 1).toISOString()
      const res = await request(app).get(`/api/receivables?asOf=${encodeURIComponent(tomorrow)}`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(400)
      const res2 = await request(app).get(`/api/receivables/aging?asOf=${encodeURIComponent(tomorrow)}`).set('Authorization', `Bearer ${token}`)
      expect(res2.status).toBe(400)
      const res3 = await request(app).get(`/api/receivables/summary?asOf=${encodeURIComponent(tomorrow)}`).set('Authorization', `Bearer ${token}`)
      expect(res3.status).toBe(400)
    })

    it('asOf past affects bucket distribution only', async () => {
      const past = subDays(new Date(), 60).toISOString()
      const rNow = await request(app).get('/api/receivables/aging').set('Authorization', `Bearer ${token}`)
      const rPast = await request(app).get(`/api/receivables/aging?asOf=${encodeURIComponent(past)}`).set('Authorization', `Bearer ${token}`)
      expect(rPast.status).toBe(200)
      // totals must still match (outstanding is date-independent)
      const sumNow = rNow.body.data.buckets.reduce((a: number, b: any) => a + b.outstanding, 0)
      const sumPast = rPast.body.data.buckets.reduce((a: number, b: any) => a + b.outstanding, 0)
      expect(sumPast).toBe(sumNow)
    })

    it('LUNAS never appears; SEBAGIAN contributes remainder not nominal', async () => {
      const kamar = await prisma.kamar.create({ data: { nomor: `${PREFIX}${Date.now()}`, lantai: '1', harga: 1000000, propertyId, status: 'TERISI' } })
      const penyewa = await prisma.penyewa.create({ data: { nama: `${PREFIX}Penyewa`, noHp: '081234567890', kamarId: kamar.id, tanggalMulaiSewa: new Date('2026-01-01'), nominalSewa: 1000000, tanggalJatuhTempo: 25, aktif: true } })
      const pembayaranBelum = await prisma.pembayaran.create({ data: { penyewaId: penyewa.id, periodeBulan: 1, periodeTahun: 2026, tanggalJatuhTempo: new Date('2026-01-25'), status: 'BELUM_BAYAR', nominal: 1000000, totalDibayar: 0 } })
      const pembayaranSebagian = await prisma.pembayaran.create({ data: { penyewaId: penyewa.id, periodeBulan: 2, periodeTahun: 2026, tanggalJatuhTempo: new Date('2026-02-25'), status: 'SEBAGIAN', nominal: 1000000, totalDibayar: 400000 } })
      const pembayaranLunas = await prisma.pembayaran.create({ data: { penyewaId: penyewa.id, periodeBulan: 3, periodeTahun: 2026, tanggalJatuhTempo: new Date('2026-03-25'), status: 'LUNAS', nominal: 1000000, totalDibayar: 1000000 } })

      const res = await request(app).get('/api/receivables').set('Authorization', `Bearer ${token}`)
      const row = res.body.data.find((r: any) => r.penyewaId === penyewa.id)
      expect(row).toBeDefined()
      // BELUM 1jt + SEBAGIAN 600k remainder = 1.6jt, LUNAS excluded
      expect(row.outstanding).toBe(1600000)
      expect(row.unpaidPeriods).toBe(2)

      // cleanup
      await prisma.pembayaran.deleteMany({ where: { id: { in: [pembayaranBelum.id, pembayaranSebagian.id, pembayaranLunas.id] } } })
      await prisma.penyewa.delete({ where: { id: penyewa.id } })
      await prisma.kamar.delete({ where: { id: kamar.id } })
    })

    it('cross-property isolation', async () => {
      const otherPropId = `test-rcv-prop-${Date.now()}`
      const otherProp = await prisma.property.create({ data: { id: otherPropId, nama: 'Other Kost', alamat: 'Test' } })
      const otherAdmin = await prisma.admin.create({ data: { email: `rcv-other-${Date.now()}@test.com`, nama: 'Other', passwordHash: 'x', role: 'OWNER', propertyId: otherPropId } })
      const otherKamar = await prisma.kamar.create({ data: { nomor: `${PREFIX}OTHER-${Date.now()}`, lantai: '1', harga: 1000000, propertyId: otherPropId, status: 'TERISI' } })
      const otherPenyewa = await prisma.penyewa.create({ data: { nama: `${PREFIX}OtherPenyewa`, noHp: '081234567890', kamarId: otherKamar.id, tanggalMulaiSewa: new Date('2026-01-01'), nominalSewa: 1000000, tanggalJatuhTempo: 25, aktif: true } })
      const otherPembayaran = await prisma.pembayaran.create({ data: { penyewaId: otherPenyewa.id, periodeBulan: 9, periodeTahun: 2026, tanggalJatuhTempo: new Date('2026-09-25'), status: 'BELUM_BAYAR', nominal: 999999, totalDibayar: 0 } })
      const otherToken = jwt.sign({ adminId: otherAdmin.id, role: otherAdmin.role, propertyId: otherPropId }, env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      const rOwner = await request(app).get('/api/receivables').set('Authorization', `Bearer ${token}`)
      expect(rOwner.body.data.some((r: any) => r.penyewaId === otherPenyewa.id)).toBe(false)

      const rOther = await request(app).get('/api/receivables').set('Authorization', `Bearer ${otherToken}`)
      expect(rOther.body.data.some((r: any) => r.penyewaId === otherPenyewa.id)).toBe(true)

      // cleanup
      await prisma.pembayaran.delete({ where: { id: otherPembayaran.id } })
      await prisma.penyewa.delete({ where: { id: otherPenyewa.id } })
      await prisma.kamar.delete({ where: { id: otherKamar.id } })
      await prisma.admin.delete({ where: { id: otherAdmin.id } })
      await prisma.property.delete({ where: { id: otherPropId } })
    })
  })
})
