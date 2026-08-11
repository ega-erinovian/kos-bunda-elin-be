import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import app from '../src/app.js'
import prisma from '../src/config/prisma.js'
import { env } from '../src/config/env.js'

const TEST_NOMOR_PREFIX = 'TEST-'

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
  return `${env.ACCESS_COOKIE_NAME}=${token}`
}

describe('Kamar API', () => {
  let ownerCookie: string

  beforeAll(async () => {
    ownerCookie = await loginAsOwner()
  })

  afterAll(async () => {
    await prisma.kamar.deleteMany({ where: { nomor: { startsWith: TEST_NOMOR_PREFIX } } })
    await prisma.$disconnect()
  })

  describe('POST /api/kamar', () => {
    it('menolak request tanpa autentikasi', async () => {
      const res = await request(app)
        .post('/api/kamar')
        .send({ nomor: `${TEST_NOMOR_PREFIX}no-auth`, lantai: '1', harga: 100000 })

      expect(res.status).toBe(401)
    })

    it('membuat kamar baru', async () => {
      const payload = {
        nomor: `${TEST_NOMOR_PREFIX}${Date.now()}`,
        lantai: '3',
        harga: 900000,
      }

      const res = await request(app).post('/api/kamar').set('Cookie', ownerCookie).send(payload)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        nomor: payload.nomor,
        lantai: payload.lantai,
        harga: String(payload.harga),
        status: 'KOSONG',
      })

      const created = await prisma.kamar.findUnique({ where: { id: res.body.data.id } })
      expect(created).not.toBeNull()
    })

    it('mengembalikan 409 saat nomor kamar sudah terdaftar', async () => {
      const payload = {
        nomor: `${TEST_NOMOR_PREFIX}duplikat`,
        lantai: '1',
        harga: 500000,
      }

      await request(app).post('/api/kamar').set('Cookie', ownerCookie).send(payload)

      const res = await request(app).post('/api/kamar').set('Cookie', ownerCookie).send(payload)

      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
    })

    it('mengembalikan 400 saat field wajib tidak diisi', async () => {
      const res = await request(app)
        .post('/api/kamar')
        .set('Cookie', ownerCookie)
        .send({ lantai: '1' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.errors).toBeDefined()
    })
  })

  describe('PATCH /api/kamar/:id', () => {
    let kamarId: string

    beforeAll(async () => {
      const kamar = await prisma.kamar.create({
        data: {
          nomor: `${TEST_NOMOR_PREFIX}patch-${Date.now()}`,
          lantai: '1',
          harga: 500000,
          propertyId: env.DEFAULT_PROPERTY_ID!, 
        },
      })
      kamarId = kamar.id
    })

    it('memperbarui kamar', async () => {
      const payload = { lantai: '2', harga: 750000, status: 'NONAKTIF' }

      const res = await request(app)
        .patch(`/api/kamar/${kamarId}`)
        .set('Cookie', ownerCookie)
        .send(payload)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        id: kamarId,
        lantai: payload.lantai,
        harga: String(payload.harga),
        status: payload.status,
      })
    })

    it('mengembalikan 400 saat body kosong', async () => {
      const res = await request(app).patch(`/api/kamar/${kamarId}`).set('Cookie', ownerCookie).send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('mengembalikan 404 untuk kamar yang tidak ada', async () => {
      const res = await request(app)
        .patch(`/api/kamar/${randomUUID()}`)
        .set('Cookie', ownerCookie)
        .send({ harga: 100000 })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  describe('DELETE /api/kamar/:id', () => {
    let kamarId: string

    beforeAll(async () => {
      const kamar = await prisma.kamar.create({
        data: {
          nomor: `${TEST_NOMOR_PREFIX}delete-${Date.now()}`,
          lantai: '1',
          harga: 500000,
          propertyId: env.DEFAULT_PROPERTY_ID!, 
        },
      })
      kamarId = kamar.id
    })

    it('menghapus kamar', async () => {
      const res = await request(app)
        .delete(`/api/kamar/${kamarId}`)
        .set('Cookie', ownerCookie)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe(kamarId)

      const deleted = await prisma.kamar.findUnique({ where: { id: kamarId } })
      expect(deleted).toBeNull()
    })

    it('mengembalikan 404 untuk kamar yang tidak ada', async () => {
      const res = await request(app)
        .delete(`/api/kamar/${randomUUID()}`)
        .set('Cookie', ownerCookie)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })
})
