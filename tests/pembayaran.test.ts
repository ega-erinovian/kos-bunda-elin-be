/**
 * Phase 5 (revision) — Payment Module Tests
 * 
 * Tests for:
 * - §1 item 4: paymentRecords embedded on detail fetch only, not on list
 * - §1 item 6: Idempotency-Key header support
 * - §1 item 7: All monetary fields are JSON numbers, never strings
 * - Response shapes match §2.1 exactly
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/app.js'
import prisma from '../src/config/prisma.js'
import { env } from '../src/config/env.js'

async function loginAsOwner(): Promise<string> {
  const admin = await prisma.admin.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } })
  if (!admin) {
    throw new Error(`Owner admin tidak ditemukan: ${env.SEED_ADMIN_EMAIL}. Jalankan seed dulu.`)
  }

  const token = jwt.sign(
    { adminId: admin.id, role: admin.role, propertyId: admin.propertyId },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' },
  )
  return token
}

describe('Payment Module - Phase 5', () => {
  let authToken: string
  let propertyId: string
  let penyewaId: string
  let pembayaranId: string
  const TEST_PREFIX = 'PHASE5-TEST-'

  beforeAll(async () => {
    // Get auth token from seeded admin
    authToken = await loginAsOwner()
    
    // Get property from seeded admin
    const admin = await prisma.admin.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } })
    propertyId = admin!.propertyId

    // Create test kamar
    const kamar = await prisma.kamar.create({
      data: {
        nomor: `${TEST_PREFIX}${Date.now()}`,
        lantai: '1',
        harga: 1500000,
        propertyId,
        status: 'TERISI',
      },
    })

    // Create test penyewa
    const penyewa = await prisma.penyewa.create({
      data: {
        nama: `${TEST_PREFIX}Penyewa`,
        noHp: '081234567890',
        kamarId: kamar.id,
        tanggalMulaiSewa: new Date('2026-01-01'),
        nominalSewa: 1500000,
        tanggalJatuhTempo: 25,
        aktif: true,
      },
    })
    penyewaId = penyewa.id
  })

  afterAll(async () => {
    // Cleanup test data
    await prisma.paymentRecord.deleteMany({ where: { pembayaran: { penyewaId } } })
    await prisma.pembayaran.deleteMany({ where: { penyewaId } })
    await prisma.penyewa.deleteMany({ where: { nama: { startsWith: TEST_PREFIX } } })
    await prisma.kamar.deleteMany({ where: { nomor: { startsWith: TEST_PREFIX } } })
    await prisma.$disconnect()
  })

  describe('POST /api/pembayaran', () => {
    it('should create a pembayaran with correct response shape', async () => {
      const response = await request(app)
        .post('/api/pembayaran')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          penyewaId,
          periodeBulan: 8,
          periodeTahun: 2026,
          tanggalJatuhTempo: '2026-08-25',
          nominal: 1500000,
          catatan: 'Test pembayaran',
        })
        .expect(201)

      pembayaranId = response.body.data.id

      // Verify response shape
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        penyewaId,
        periodeBulan: 8,
        periodeTahun: 2026,
        status: 'BELUM_BAYAR',
        nominal: 1500000, // §1 item 7: must be number
        totalDibayar: 0, // §1 item 7: must be number
      })

      // Ensure monetary fields are numbers, not strings
      expect(typeof response.body.data.nominal).toBe('number')
      expect(typeof response.body.data.totalDibayar).toBe('number')
    })
  })

  describe('GET /api/pembayaran (list)', () => {
    it('should return list WITHOUT paymentRecords embedded (§1 item 4)', async () => {
      const response = await request(app)
        .get('/api/pembayaran')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.data).toBeInstanceOf(Array)
      
      if (response.body.data.length > 0) {
        const pembayaran = response.body.data[0]
        // §1 item 4: paymentRecords should NOT be present on list responses
        expect(pembayaran.paymentRecords).toBeUndefined()
        
        // Verify monetary fields are numbers
        expect(typeof pembayaran.nominal).toBe('number')
        expect(typeof pembayaran.totalDibayar).toBe('number')
      }
    })
  })

  describe('GET /api/pembayaran/:id (detail)', () => {
    it('should return detail WITH paymentRecords embedded (§1 item 4)', async () => {
      const response = await request(app)
        .get(`/api/pembayaran/${pembayaranId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // §1 item 4: paymentRecords MUST be present on detail responses
      expect(response.body.data.paymentRecords).toBeDefined()
      expect(Array.isArray(response.body.data.paymentRecords)).toBe(true)
      
      // Initially empty
      expect(response.body.data.paymentRecords).toHaveLength(0)

      // Verify monetary fields are numbers
      expect(typeof response.body.data.nominal).toBe('number')
      expect(typeof response.body.data.totalDibayar).toBe('number')
    })
  })

  describe('POST /api/pembayaran/:id/payments', () => {
    it('should add payment record with idempotency key', async () => {
      const idempotencyKey = 'test-idempotency-key-1'
      
      const response = await request(app)
        .post(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          paymentMethod: 'CASH',
          paymentDate: '2026-08-19',
          amountPaid: 750000,
          notes: 'Partial payment',
        })
        .expect(201)

      // Verify response shape per §2.1
      expect(response.body.data).toMatchObject({
        paymentRecord: {
          id: expect.any(String),
          pembayaranId,
          paymentMethod: 'CASH',
          amountPaid: 750000, // §1 item 7: must be number
        },
        pembayaran: {
          id: pembayaranId,
          status: 'SEBAGIAN', // Now partially paid
          totalDibayar: 750000, // §1 item 7: must be number
        },
      })

      // Ensure monetary fields are numbers
      expect(typeof response.body.data.paymentRecord.amountPaid).toBe('number')
      expect(typeof response.body.data.pembayaran.totalDibayar).toBe('number')
    })

    it('should return 200 with same result for idempotent replay (§1 item 6)', async () => {
      const idempotencyKey = 'test-idempotency-key-2'
      
      // First request
      const response1 = await request(app)
        .post(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          paymentMethod: 'BANK_TRANSFER',
          paymentDate: '2026-08-19',
          amountPaid: 750000,
          referenceNumber: 'REF-12345',
        })
        .expect(201)

      const firstPaymentId = response1.body.data.paymentRecord.id

      // Replay the same request with same idempotency key
      const response2 = await request(app)
        .post(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          paymentMethod: 'BANK_TRANSFER',
          paymentDate: '2026-08-19',
          amountPaid: 750000,
          referenceNumber: 'REF-12345',
        })
        .expect(200) // §1 item 6: Returns 200 for replay

      // Should return the same payment record
      expect(response2.body.data.paymentRecord.id).toBe(firstPaymentId)
      
      // Verify no duplicate payment was created
      const paymentCount = await prisma.paymentRecord.count({
        where: { idempotencyKey },
      })
      expect(paymentCount).toBe(1)
    })

    it('should handle overpayment with warning flag', async () => {
      const response = await request(app)
        .post(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', 'test-overpayment-key')
        .send({
          paymentMethod: 'CASH',
          paymentDate: '2026-08-19',
          amountPaid: 2000000, // Overpayment (already paid 1.5M, total 3.5M)
        })
        .expect(201)

      // Should include warning flag
      expect(response.body.data.warning).toBe('overpaid')
      expect(response.body.data.pembayaran.status).toBe('LUNAS')
    })
  })

  describe('GET /api/pembayaran/:id/payments', () => {
    it('should return payment history with correct shape', async () => {
      const response = await request(app)
        .get(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.data.data).toBeInstanceOf(Array)
      expect(response.body.data.data.length).toBeGreaterThan(0)

      const paymentRecord = response.body.data.data[0]
      
      // Verify shape per §2.1
      expect(paymentRecord).toMatchObject({
        id: expect.any(String),
        pembayaranId,
        paymentMethod: expect.any(String),
        paymentDate: expect.any(String),
        amountPaid: expect.any(Number), // §1 item 7: must be number
      })

      // Ensure monetary field is number
      expect(typeof paymentRecord.amountPaid).toBe('number')
    })
  })

  describe('Decimal to Number conversion (§1 item 7)', () => {
    it('should never return Decimal as string in any endpoint', async () => {
      // Test all endpoints that return monetary values
      
      // 1. List
      const listRes = await request(app)
        .get('/api/pembayaran')
        .set('Authorization', `Bearer ${authToken}`)

      listRes.body.data.forEach((item: any) => {
        expect(typeof item.nominal).toBe('number')
        expect(typeof item.totalDibayar).toBe('number')
      })

      // 2. Detail
      const detailRes = await request(app)
        .get(`/api/pembayaran/${pembayaranId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(typeof detailRes.body.data.nominal).toBe('number')
      expect(typeof detailRes.body.data.totalDibayar).toBe('number')
      
      detailRes.body.data.paymentRecords.forEach((record: any) => {
        expect(typeof record.amountPaid).toBe('number')
      })

      // 3. Payment history
      const historyRes = await request(app)
        .get(`/api/pembayaran/${pembayaranId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)

      historyRes.body.data.data.forEach((record: any) => {
        expect(typeof record.amountPaid).toBe('number')
      })
    })
  })
})
