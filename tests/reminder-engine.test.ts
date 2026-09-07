import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/app.js'
import prisma from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { runReminderSweep, sendManualReminder } from '../src/modules/notification/reminder.service.js'

const TEST_PREFIX = 'PH9-REM-'
const FIXED_NOW = new Date('2026-12-15T08:00:00+07:00')

function dueForOffset(offset: number, base = FIXED_NOW): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const due = new Date(d)
  due.setDate(d.getDate() - offset)
  return due
}

async function loginAs(role: 'OWNER' | 'STAFF' = 'OWNER'): Promise<{ token: string; adminId: string; propertyId: string }> {
  const admin = await prisma.admin.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } })
  if (!admin) throw new Error('seed admin not found')
  if (role === 'OWNER') {
    const token = jwt.sign({ adminId: admin.id, role: admin.role, propertyId: admin.propertyId }, env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
    return { token, adminId: admin.id, propertyId: admin.propertyId }
  }

  const staff = await prisma.admin.create({
    data: {
      nama: `${TEST_PREFIX}Staff`,
      email: `${TEST_PREFIX.toLowerCase()}staff-${Date.now()}@test.com`,
      passwordHash: 'hash',
      role: 'STAFF',
      propertyId: admin.propertyId,
    },
  })
  const token = jwt.sign({ adminId: staff.id, role: staff.role, propertyId: staff.propertyId }, env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
  return { token, adminId: staff.id, propertyId: staff.propertyId }
}

describe('Payment Reminder Engine - Phase 9', () => {
  let ownerToken: string
  let staffToken: string
  let staffAdminId: string
  let propertyId: string

  let kamarId: string
  let penyewaId: string

  beforeAll(async () => {
    const owner = await loginAs('OWNER')
    ownerToken = owner.token
    propertyId = owner.propertyId

    const staff = await loginAs('STAFF')
    staffToken = staff.token
    staffAdminId = staff.adminId

    await prisma.reminderConfig.upsert({
      where: { propertyId },
      update: { offsets: [-7, -3, -1, 0, 1, 3, 7], channels: ['WEB_PUSH'], active: true },
      create: { propertyId, offsets: [-7, -3, -1, 0, 1, 3, 7], channels: ['WEB_PUSH'], active: true },
    })
    // ensure templates exist for both jenis (so isiRingkas is rendered, not fallback-only)
    for (const jenis of ['REMINDER_JATUH_TEMPO', 'REMINDER_TUNGGAKAN'] as const) {
      await prisma.messageTemplate.upsert({
        where: { propertyId_channel_jenis: { propertyId, channel: 'WEB_PUSH' as any, jenis: jenis as any } },
        update: {
          isi:
            jenis === 'REMINDER_JATUH_TEMPO'
              ? 'Jatuh tempo {{nama}} kamar {{kamar}} sisa {{sisaTagihan}} nominal {{nominal}} periode {{periode}}'
              : 'Tunggakan {{nama}} kamar {{kamar}} sisa {{sisaTagihan}} menunggak sejak {{tanggalJatuhTempo}}',
          aktif: true,
        },
        create: {
          propertyId,
          channel: 'WEB_PUSH' as any,
          jenis: jenis as any,
          isi:
            jenis === 'REMINDER_JATUH_TEMPO'
              ? 'Jatuh tempo {{nama}} kamar {{kamar}} sisa {{sisaTagihan}} nominal {{nominal}} periode {{periode}}'
              : 'Tunggakan {{nama}} kamar {{kamar}} sisa {{sisaTagihan}} menunggak sejak {{tanggalJatuhTempo}}',
          aktif: true,
        },
      })
    }

    const kamar = await prisma.kamar.create({
      data: { nomor: `${TEST_PREFIX}${Date.now()}`, lantai: '1', harga: 1000000, propertyId, status: 'TERISI' },
    })
    kamarId = kamar.id
    const penyewa = await prisma.penyewa.create({
      data: {
        nama: `${TEST_PREFIX}Budi`,
        noHp: '628123456789',
        kamarId,
        tanggalMulaiSewa: new Date('2026-01-01'),
        nominalSewa: 1000000,
        tanggalJatuhTempo: 15,
        aktif: true,
      },
    })
    penyewaId = penyewa.id
  })

  afterAll(async () => {
    const penyewaIds = (await prisma.penyewa.findMany({ where: { nama: { startsWith: TEST_PREFIX } }, select: { id: true } })).map((p) => p.id)
    if (penyewaIds.length) {
      await prisma.notificationLog.deleteMany({ where: { penyewaId: { in: penyewaIds } } })
      const pembayaranIds = (await prisma.pembayaran.findMany({ where: { penyewaId: { in: penyewaIds } }, select: { id: true } })).map((p) => p.id)
      if (pembayaranIds.length) {
        await prisma.notificationLog.deleteMany({ where: { pembayaranId: { in: pembayaranIds } } })
        await prisma.paymentRecord.deleteMany({ where: { pembayaranId: { in: pembayaranIds } } })
      }
      await prisma.pembayaran.deleteMany({ where: { penyewaId: { in: penyewaIds } } })
    }
    await prisma.penyewa.deleteMany({ where: { nama: { startsWith: TEST_PREFIX } } })
    await prisma.kamar.deleteMany({ where: { nomor: { startsWith: TEST_PREFIX } } })
    await prisma.notificationLog.deleteMany({ where: { propertyId, dedupeKey: { contains: 'PH9' } } })
    if (staffAdminId) await prisma.admin.deleteMany({ where: { id: staffAdminId } })
    await prisma.$disconnect()
  })

  async function createBill(offset: number, opts: { status?: string; totalDibayar?: number; periodeBulan: number }) {
    const due = dueForOffset(offset)
    return prisma.pembayaran.create({
      data: {
        penyewaId,
        periodeBulan: opts.periodeBulan,
        periodeTahun: 2026,
        tanggalJatuhTempo: due,
        nominal: 1000000,
        totalDibayar: opts.totalDibayar ?? 0,
        status: (opts.status as any) ?? 'BELUM_BAYAR',
        catatan: `${TEST_PREFIX}offset-${offset}`,
      },
    })
  }

  describe('reminder sweep (service, deterministic now)', () => {
    const sweepBills: string[] = []

    beforeEach(async () => {
      if (sweepBills.length) {
        await prisma.notificationLog.deleteMany({ where: { pembayaranId: { in: sweepBills } } })
        await prisma.pembayaran.deleteMany({ where: { id: { in: sweepBills } } })
        sweepBills.length = 0
      }
      await prisma.notificationLog.deleteMany({ where: { propertyId, dedupeKey: { contains: FIXED_NOW.toISOString().slice(0, 10) } } })
    })

    it('sends exactly the bills whose daysFromDue matches ReminderConfig.offsets with correct jenis', async () => {
      const offsetsToCreate = [-7, -3, -1, 0, 1, 3, 7, 2] // last one (2) is NOT in config -> should be skipped
      for (let i = 0; i < offsetsToCreate.length; i++) {
        const b = await createBill(offsetsToCreate[i], { periodeBulan: i + 1, status: offsetsToCreate[i] === 1 ? 'SEBAGIAN' : 'BELUM_BAYAR', totalDibayar: offsetsToCreate[i] === 1 ? 400000 : 0 })
        sweepBills.push(b.id)
      }

      const lunas = await prisma.pembayaran.create({
        data: {
          penyewaId,
          periodeBulan: 11,
          periodeTahun: 2026,
          tanggalJatuhTempo: dueForOffset(0),
          nominal: 1000000,
          totalDibayar: 1000000,
          status: 'LUNAS' as any,
          catatan: `${TEST_PREFIX}lunas`,
        },
      })
      sweepBills.push(lunas.id)

      const result = await runReminderSweep({ propertyId, now: FIXED_NOW })

      expect(result.sent).toBe(7)
      expect(result.sentLogs).toHaveLength(7)

      const jenisByOffset: Record<number, string> = {
        [-7]: 'REMINDER_JATUH_TEMPO',
        [-3]: 'REMINDER_JATUH_TEMPO',
        [-1]: 'REMINDER_JATUH_TEMPO',
        [0]: 'REMINDER_JATUH_TEMPO',
        [1]: 'REMINDER_TUNGGAKAN',
        [3]: 'REMINDER_TUNGGAKAN',
        [7]: 'REMINDER_TUNGGAKAN',
      }
      for (const log of result.sentLogs) {
        // verify jenis derived from offset sign
        const billId = log.pembayaranId!
        const bill = await prisma.pembayaran.findUnique({ where: { id: billId } })
        const offset = ((d: Date) => {
          const a = new Date(FIXED_NOW); a.setHours(0,0,0,0)
          const b = new Date(d); b.setHours(0,0,0,0)
          return Math.round((a.getTime() - b.getTime()) / 86400000)
        })(bill!.tanggalJatuhTempo)
        expect(log.jenis).toBe(jenisByOffset[offset])
      }
      // LUNAS bill must not have a log
      const lunasLogs = result.sentLogs.filter((l) => l.pembayaranId === lunas.id)
      expect(lunasLogs).toHaveLength(0)
    })

    it('renders remaining balance for SEBAGIAN, not full nominal', async () => {
      const sebagian = await createBill(1, { periodeBulan: 9, status: 'SEBAGIAN', totalDibayar: 400000 })
      sweepBills.push(sebagian.id)

      const result = await runReminderSweep({ propertyId, now: FIXED_NOW })
      const log = result.sentLogs.find((l) => l.pembayaranId === sebagian.id)
      expect(log).toBeDefined()

      expect(log!.isiRingkas).toContain('600.000')
    })

    it('does not duplicate when sweep is run twice on same day (dedupeKey)', async () => {
      const b = await createBill(0, { periodeBulan: 10, totalDibayar: 0 })
      sweepBills.push(b.id)

      const first = await runReminderSweep({ propertyId, now: FIXED_NOW })
      expect(first.sent).toBeGreaterThanOrEqual(1)
      const firstCount = await prisma.notificationLog.count({ where: { pembayaranId: b.id } })

      const second = await runReminderSweep({ propertyId, now: FIXED_NOW })
      expect(second.sent).toBe(0)
      expect(second.skippedReasons.some((r) => r.reason === 'duplicate_today')).toBe(true)

      const secondCount = await prisma.notificationLog.count({ where: { pembayaranId: b.id } })
      expect(secondCount).toBe(firstCount) // no new row
    })

    it('skips all bills when ReminderConfig.active is false', async () => {
      await prisma.reminderConfig.update({ where: { propertyId }, data: { active: false } })
      const b = await createBill(0, { periodeBulan: 12, totalDibayar: 0 })
      sweepBills.push(b.id)

      const result = await runReminderSweep({ propertyId, now: FIXED_NOW })
      expect(result.sent).toBe(0)

      await prisma.reminderConfig.update({ where: { propertyId }, data: { active: true } })
    })
  })

  describe('manual send (service)', () => {
    let manualBillId: string
    let manualPenyewaId: string
    let otherPenyewaBillId: string

    beforeAll(async () => {
      const due = dueForOffset(2) 
      const bill = await prisma.pembayaran.create({
        data: {
          penyewaId,
          periodeBulan: 8,
          periodeTahun: 2027,
          tanggalJatuhTempo: due,
          nominal: 1200000,
          totalDibayar: 0,
          status: 'BELUM_BAYAR' as any,
          catatan: `${TEST_PREFIX}manual-bypass`,
        },
      })
      manualBillId = bill.id

      const k2 = await prisma.kamar.create({ data: { nomor: `${TEST_PREFIX}M2-${Date.now()}`, lantai: '1', harga: 800000, propertyId, status: 'TERISI' } })
      const p2 = await prisma.penyewa.create({
        data: { nama: `${TEST_PREFIX}Wati`, noHp: '628987654321', kamarId: k2.id, tanggalMulaiSewa: new Date('2026-01-01'), nominalSewa: 800000, tanggalJatuhTempo: 20, aktif: true },
      })
      manualPenyewaId = p2.id
      const b2a = await prisma.pembayaran.create({
        data: { penyewaId: p2.id, periodeBulan: 1, periodeTahun: 2027, tanggalJatuhTempo: dueForOffset(2), nominal: 800000, totalDibayar: 0, status: 'BELUM_BAYAR' as any, catatan: `${TEST_PREFIX}manual-p2a` },
      })
      const b2b = await prisma.pembayaran.create({
        data: { penyewaId: p2.id, periodeBulan: 2, periodeTahun: 2027, tanggalJatuhTempo: dueForOffset(-1), nominal: 800000, totalDibayar: 0, status: 'BELUM_BAYAR' as any, catatan: `${TEST_PREFIX}manual-p2b` },
      })
      otherPenyewaBillId = b2a.id
    })

    afterAll(async () => {
      const ids = [manualBillId, otherPenyewaBillId].filter(Boolean)
      if (ids.length) {
        await prisma.notificationLog.deleteMany({ where: { pembayaranId: { in: ids } } })
        await prisma.pembayaran.deleteMany({ where: { id: { in: ids } } })
      }
      if (manualPenyewaId) {
        const pBills = await prisma.pembayaran.findMany({ where: { penyewaId: manualPenyewaId }, select: { id: true } })
        const pBillIds = pBills.map((b) => b.id)
        if (pBillIds.length) {
          await prisma.notificationLog.deleteMany({ where: { pembayaranId: { in: pBillIds } } })
          await prisma.pembayaran.deleteMany({ where: { id: { in: pBillIds } } })
        }
        await prisma.penyewa.deleteMany({ where: { id: manualPenyewaId } })
        await prisma.kamar.deleteMany({ where: { nomor: { startsWith: `${TEST_PREFIX}M2-` } } })
      }
      await prisma.notificationLog.deleteMany({ where: { pembayaranId: manualBillId } })
      await prisma.pembayaran.deleteMany({ where: { id: manualBillId } })
    })

    it('bypasses offset check: bill with offset 2 (normally skipped) is sent manually', async () => {
      await prisma.notificationLog.deleteMany({ where: { pembayaranId: manualBillId } })
      const res = await sendManualReminder({ propertyId, pembayaranId: manualBillId, now: FIXED_NOW })
      expect(res.sent).toHaveLength(1)
      expect(res.sent[0].pembayaranId).toBe(manualBillId)
      expect(res.skipped).toHaveLength(0)
    })

    it('still respects dedupeKey: second manual same day is skipped', async () => {
      const second = await sendManualReminder({ propertyId, pembayaranId: manualBillId, now: FIXED_NOW })
      expect(second.sent).toHaveLength(0)
      expect(second.skipped[0].reason).toMatch(/duplicate_today/)
    })

    it('fans out to all outstanding bills when penyewaId is given', async () => {
      const pBills = await prisma.pembayaran.findMany({ where: { penyewaId: manualPenyewaId }, select: { id: true } })
      await prisma.notificationLog.deleteMany({ where: { pembayaranId: { in: pBills.map((b) => b.id) } } })

      const res = await sendManualReminder({ propertyId, penyewaId: manualPenyewaId, now: FIXED_NOW })
      expect(res.sent).toHaveLength(2)
      expect(res.sent.every((l) => l.penyewaId === manualPenyewaId)).toBe(true)
    })

    it('rejects when pembayaranId does not belong to caller property (404)', async () => {
      const otherProp = await prisma.property.create({ data: { nama: `${TEST_PREFIX}OtherProp`, alamat: 'other' } })
      const otherKamar = await prisma.kamar.create({ data: { nomor: `${TEST_PREFIX}OTH-${Date.now()}`, lantai: '1', harga: 500000, propertyId: otherProp.id, status: 'TERISI' } })
      const otherPenyewa = await prisma.penyewa.create({
        data: { nama: `${TEST_PREFIX}Other`, noHp: '628000000001', kamarId: otherKamar.id, tanggalMulaiSewa: new Date('2026-01-01'), nominalSewa: 500000, tanggalJatuhTempo: 5, aktif: true },
      })
      const otherBill = await prisma.pembayaran.create({
        data: { penyewaId: otherPenyewa.id, periodeBulan: 9, periodeTahun: 2027, tanggalJatuhTempo: new Date(), nominal: 500000, totalDibayar: 0, status: 'BELUM_BAYAR' as any },
      })
      await expect(sendManualReminder({ propertyId, pembayaranId: otherBill.id, now: FIXED_NOW })).rejects.toMatchObject({ statusCode: 404 })

      await prisma.pembayaran.deleteMany({ where: { id: otherBill.id } })
      await prisma.penyewa.deleteMany({ where: { id: otherPenyewa.id } })
      await prisma.kamar.deleteMany({ where: { id: otherKamar.id } })
      await prisma.property.deleteMany({ where: { id: otherProp.id } })
    })

    it('skips already LUNAS bill (already_paid)', async () => {
      const lunas = await prisma.pembayaran.create({
        data: { penyewaId, periodeBulan: 9, periodeTahun: 2028, tanggalJatuhTempo: dueForOffset(0), nominal: 1000000, totalDibayar: 1000000, status: 'LUNAS' as any, catatan: `${TEST_PREFIX}lunas-manual` },
      })
      const res = await sendManualReminder({ propertyId, pembayaranId: lunas.id, now: FIXED_NOW })
      expect(res.sent).toHaveLength(0)
      expect(res.skipped[0].reason).toBe('already_paid')
      await prisma.pembayaran.deleteMany({ where: { id: lunas.id } })
    })
  })

  describe('HTTP: POST /api/notification/reminders/*', () => {
    let httpBillId: string

    beforeAll(async () => {
      const dueToday = new Date()
      dueToday.setHours(0, 0, 0, 0)
      const bill = await prisma.pembayaran.create({
        data: {
          penyewaId,
          periodeBulan: 7,
          periodeTahun: 2029,
          tanggalJatuhTempo: dueToday,
          nominal: 1000000,
          totalDibayar: 0,
          status: 'BELUM_BAYAR' as any,
          catatan: `${TEST_PREFIX}http`,
        },
      })
      httpBillId = bill.id
    })

    afterAll(async () => {
      await prisma.notificationLog.deleteMany({ where: { pembayaranId: httpBillId } })
      await prisma.pembayaran.deleteMany({ where: { id: httpBillId } })
    })

    beforeEach(async () => {
      await prisma.notificationLog.deleteMany({ where: { pembayaranId: httpBillId } })
    })

    it('401 when unauthenticated', async () => {
      const res = await request(app).post('/api/notification/reminders/send').send({ pembayaranId: httpBillId })
      expect(res.status).toBe(401)
    })

    it('400 when body has neither id', async () => {
      const res = await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({})
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Validation error/)
    })

    it('400 when body has both ids', async () => {
      const res = await request(app)
        .post('/api/notification/reminders/send')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pembayaranId: httpBillId, penyewaId })
      expect(res.status).toBe(400)
    })

    it('400 when pembayaranId is not a UUID', async () => {
      const res = await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({ pembayaranId: 'not-a-uuid' })
      expect(res.status).toBe(400)
    })

    it('200 with {sent, skipped} shape and correct mapping via static helper (success path)', async () => {
      const res = await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({ pembayaranId: httpBillId })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('sent')
      expect(res.body.data).toHaveProperty('skipped')
      expect(Array.isArray(res.body.data.sent)).toBe(true)
      expect(res.body.data.sent).toHaveLength(1)
      const log = res.body.data.sent[0]
      expect(log).toMatchObject({ channel: 'WEB_PUSH', jenis: expect.any(String), recipient: expect.any(String), status: expect.any(String), isiRingkas: expect.any(String) })
      expect(log.propertyId).toBeUndefined()
      expect(log.penyewaId).toBeUndefined()
      expect(log.pembayaranId).toBeUndefined()
    })

    it('second manual same day returns deduped skipped (idempotency per day)', async () => {
      await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({ pembayaranId: httpBillId })
      const second = await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({ pembayaranId: httpBillId })
      expect(second.status).toBe(200)
      expect(second.body.data.sent).toHaveLength(0)
      expect(second.body.data.skipped[0].reason).toMatch(/duplicate_today/)
    })

    it('404 for cross-property pembayaranId (never 403 to avoid leaking existence)', async () => {
      const otherProp = await prisma.property.create({ data: { nama: `${TEST_PREFIX}Cross`, alamat: 'cross' } })
      const otherKamar = await prisma.kamar.create({ data: { nomor: `${TEST_PREFIX}CR-${Date.now()}`, lantai: '1', harga: 500000, propertyId: otherProp.id, status: 'TERISI' } })
      const otherPenyewa = await prisma.penyewa.create({
        data: { nama: `${TEST_PREFIX}Cross`, noHp: '628000000002', kamarId: otherKamar.id, tanggalMulaiSewa: new Date('2026-01-01'), nominalSewa: 500000, tanggalJatuhTempo: 5, aktif: true },
      })
      const otherBill = await prisma.pembayaran.create({
        data: { penyewaId: otherPenyewa.id, periodeBulan: 8, periodeTahun: 2029, tanggalJatuhTempo: new Date(), nominal: 500000, totalDibayar: 0, status: 'BELUM_BAYAR' as any },
      })

      const res = await request(app).post('/api/notification/reminders/send').set('Authorization', `Bearer ${ownerToken}`).send({ pembayaranId: otherBill.id })
      expect(res.status).toBe(404)

      await prisma.pembayaran.deleteMany({ where: { id: otherBill.id } })
      await prisma.penyewa.deleteMany({ where: { id: otherPenyewa.id } })
      await prisma.kamar.deleteMany({ where: { id: otherKamar.id } })
      await prisma.property.deleteMany({ where: { id: otherProp.id } })
    })

    it('POST /api/notification/reminders/run-sweep requires OWNER (STAFF gets 403)', async () => {
      const res = await request(app).post('/api/notification/reminders/run-sweep').set('Authorization', `Bearer ${staffToken}`).send({})
      expect(res.status).toBe(403)
    })

    it('POST /api/notification/reminders/run-sweep succeeds for OWNER and returns {sent,skipped}', async () => {
      const res = await request(app).post('/api/notification/reminders/run-sweep').set('Authorization', `Bearer ${ownerToken}`).send({})
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.sent).toBe('number')
      expect(typeof res.body.data.skipped).toBe('number')
    })

    it('POST /api/notification/reminders/run-sweep requires auth', async () => {
      const res = await request(app).post('/api/notification/reminders/run-sweep').send({})
      expect(res.status).toBe(401)
    })
  })
})
