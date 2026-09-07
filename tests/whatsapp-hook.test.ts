import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import app from '../src/app.js'
import prisma from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { NotificationStatus } from '@prisma/client'
import { updateStatusFromWebhook, retryFailedNotifications } from '../src/modules/notification/notification.service.js'
import { _internal as webhookInternal } from '../src/modules/notification/whatsapp-webhook.controller.js'

const TEST_PREFIX = 'PH10-'

async function loginAsOwner() {
  const admin = await prisma.admin.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } })
  if (!admin) throw new Error('seed admin not found')
  const token = jwt.sign({ adminId: admin.id, role: admin.role, propertyId: admin.propertyId }, env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
  return { token, adminId: admin.id, propertyId: admin.propertyId }
}

describe('WhatsApp Webhook, Delivery Tracking, Retry, Resend', () => {
  let ownerToken: string
  let propertyId: string
  let penyewaId: string
  let kamarId: string

  beforeAll(async () => {
    const owner = await loginAsOwner()
    ownerToken = owner.token
    propertyId = owner.propertyId

    const kamar = await prisma.kamar.create({
      data: { nomor: `${TEST_PREFIX}K-${Date.now()}`, lantai: '1', harga: 1000000, propertyId, status: 'TERISI' },
    })
    kamarId = kamar.id
    const penyewa = await prisma.penyewa.create({
      data: {
        nama: `${TEST_PREFIX}Penyewa`,
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
    await prisma.notificationLog.deleteMany({ where: { propertyId, dedupeKey: { contains: TEST_PREFIX } } })
    await prisma.notificationLog.deleteMany({ where: { propertyId, providerMessageId: { contains: TEST_PREFIX } } })
    await prisma.notificationLog.deleteMany({ where: { propertyId, recipient: { contains: '628' } } })
    // clean created bills/paymentRecords if any leaked
    const pIds = (await prisma.penyewa.findMany({ where: { id: penyewaId }, select: { id: true } })).map((p) => p.id)
    if (pIds.length) {
      await prisma.notificationLog.deleteMany({ where: { penyewaId: { in: pIds } } })
    }
    await prisma.penyewa.deleteMany({ where: { id: penyewaId } })
    await prisma.kamar.deleteMany({ where: { id: kamarId } })
    // clean any retry test logs with specific dedupe prefix
    await prisma.notificationLog.deleteMany({ where: { dedupeKey: { contains: 'retry-' } } })
    await prisma.notificationLog.deleteMany({ where: { dedupeKey: { contains: 'resend-' } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // clean retry/resend logs between tests
    await prisma.notificationLog.deleteMany({ where: { propertyId, dedupeKey: { contains: 'retry-' } } })
    await prisma.notificationLog.deleteMany({ where: { propertyId, dedupeKey: { contains: 'resend-' } } })
    await prisma.notificationLog.deleteMany({ where: { providerMessageId: { contains: 'PH10-RETRY' } } })
    await prisma.notificationLog.deleteMany({ where: { providerMessageId: { contains: 'PH10-WEBHOOK' } } })
  })

  // -------------------------------------------------------------------------
  // HMAC unit
  // -------------------------------------------------------------------------

  describe('HMAC verification', () => {
    it('rejects tampered payloads (unit)', () => {
      const secret = 'test-app-secret'
      const raw = JSON.stringify({ foo: 'bar' })
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
      expect(webhookInternal.verifyHmacSignature(raw, sig, secret)).toBe(true)
      expect(webhookInternal.verifyHmacSignature(raw + 'x', sig, secret)).toBe(false)
      expect(webhookInternal.verifyHmacSignature(raw, 'sha256=' + '00'.repeat(32), secret)).toBe(false)
    })

    it('POST webhook rejects invalid HMAC when provider=cloud and secret set (integration)', async () => {
      const origProvider = (env as any).WHATSAPP_PROVIDER
      const origSecret = (env as any).WHATSAPP_APP_SECRET
      ;(env as any).WHATSAPP_PROVIDER = 'cloud'
      ;(env as any).WHATSAPP_APP_SECRET = 'test-app-secret'

      const body = { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] }
      const raw = JSON.stringify(body)
      // tampered sig
      const badSig = 'sha256=' + 'aa'.repeat(32)

      const res = await request(app)
        .post('/api/notification/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', badSig)
        .send(body)

      expect(res.status).toBe(401)

      ;(env as any).WHATSAPP_PROVIDER = origProvider
      ;(env as any).WHATSAPP_APP_SECRET = origSecret
    })

    it('POST webhook accepts valid HMAC and acks (integration)', async () => {
      const origProvider = (env as any).WHATSAPP_PROVIDER
      const origSecret = (env as any).WHATSAPP_APP_SECRET
      ;(env as any).WHATSAPP_PROVIDER = 'cloud'
      ;(env as any).WHATSAPP_APP_SECRET = 'test-app-secret'

      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [{ id: 'PH10-WEBHOOK-valid-hmac', status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }],
                },
                field: 'messages',
              },
            ],
          },
        ],
      }
      const raw = JSON.stringify(body)
      const sig = 'sha256=' + crypto.createHmac('sha256', 'test-app-secret').update(raw).digest('hex')

      // need a log for this id
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} hmac valid`,
          dedupeKey: `${TEST_PREFIX}hmac-valid-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: 'PH10-WEBHOOK-valid-hmac',
          sentAt: new Date(),
        },
      })

      const res = await request(app)
        .post('/api/notification/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sig)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const updated = await prisma.notificationLog.findFirst({ where: { providerMessageId: 'PH10-WEBHOOK-valid-hmac' } })
      expect(updated?.status).toBe(NotificationStatus.DELIVERED)
      expect(updated?.deliveredAt).toBeTruthy()

      ;(env as any).WHATSAPP_PROVIDER = origProvider
      ;(env as any).WHATSAPP_APP_SECRET = origSecret
    })
  })

  // -------------------------------------------------------------------------
  // GET verification handshake
  // -------------------------------------------------------------------------

  describe('GET /api/notification/whatsapp/webhook verification', () => {
    it('returns hub.challenge when token matches', async () => {
      const res = await request(app)
        .get('/api/notification/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'CHALLENGE123' })
      expect(res.status).toBe(200)
      expect(res.text).toBe('CHALLENGE123')
    })

    it('returns 403 when token mismatches (cloud provider)', async () => {
      const origProvider = (env as any).WHATSAPP_PROVIDER
      ;(env as any).WHATSAPP_PROVIDER = 'cloud'
      const res = await request(app)
        .get('/api/notification/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'CHALLENGE123' })
      expect(res.status).toBe(403)
      ;(env as any).WHATSAPP_PROVIDER = origProvider
    })
  })

  // -------------------------------------------------------------------------
  // Webhook status transitions
  // -------------------------------------------------------------------------

  describe('Webhook status transitions (Meta + Evolution shapes)', () => {
    it('SENT -> DELIVERED via Meta shape (integration, mock provider allows HMAC skip)', async () => {
      const id = `PH10-WEBHOOK-${Date.now()}-delivered`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} to delivered`,
          dedupeKey: `${TEST_PREFIX}delivered-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: id,
          sentAt: new Date(),
        },
      })

      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [{ id, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }],
                },
                field: 'messages',
              },
            ],
          },
        ],
      }

      // mock provider -> HMAC skip (env provider is mock)
      const res = await request(app).post('/api/notification/whatsapp/webhook').send(body)
      expect(res.status).toBe(200)
      const log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.DELIVERED)
      expect(log?.deliveredAt).toBeTruthy()
    })

    it('SENT -> READ via Meta shape', async () => {
      const id = `PH10-WEBHOOK-${Date.now()}-read`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_TUNGGAKAN' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} to read`,
          dedupeKey: `${TEST_PREFIX}read-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: id,
          sentAt: new Date(),
        },
      })
      const body = {
        entry: [{ changes: [{ value: { statuses: [{ id, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }],
      }
      const res = await request(app).post('/api/notification/whatsapp/webhook').send(body)
      expect(res.status).toBe(200)
      const log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.READ)
      expect(log?.readAt).toBeTruthy()
    })

    it('SENT -> FAILED via Meta shape captures failureReason with [permanent]', async () => {
      const id = `PH10-WEBHOOK-${Date.now()}-failed`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} to failed`,
          dedupeKey: `${TEST_PREFIX}failed-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: id,
          sentAt: new Date(),
        },
      })
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id,
                      status: 'failed',
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      errors: [{ title: 'Invalid recipient', message: 'Phone number invalid' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const res = await request(app).post('/api/notification/whatsapp/webhook').send(body)
      expect(res.status).toBe(200)
      const log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.FAILED)
      expect(log?.failureReason).toMatch(/Invalid recipient/)
      expect(log?.failedAt).toBeTruthy()
    })

    it('Evolution shape: DELIVERED via {event, data:{key:{id}, status}}', async () => {
      const id = `PH10-WEBHOOK-EVO-${Date.now()}`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} evo delivered`,
          dedupeKey: `${TEST_PREFIX}evo-delivered-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: id,
          sentAt: new Date(),
        },
      })
      const body = {
        event: 'messages.update',
        instance: 'test-instance',
        data: {
          key: { remoteJid: '628123456789@s.whatsapp.net', fromMe: true, id },
          status: 'DELIVERED',
          messageTimestamp: String(Math.floor(Date.now() / 1000)),
        },
      }
      const res = await request(app).post('/api/notification/whatsapp/webhook').send(body)
      expect(res.status).toBe(200)
      const log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.DELIVERED)
    })

    it('malformed payload is acked 200 not 500', async () => {
      const res = await request(app).post('/api/notification/whatsapp/webhook').send({ nonsense: true, foo: 'bar' })
      expect(res.status).toBe(200)
    })

    it('updateStatusFromWebhook service handles SENT->DELIVERED->READ chain (unit via service)', async () => {
      const id = `PH10-WEBHOOK-CHAIN-${Date.now()}`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} chain`,
          dedupeKey: `${TEST_PREFIX}chain-${Date.now()}`,
          status: NotificationStatus.SENT,
          providerMessageId: id,
          sentAt: new Date(),
        },
      })
      await updateStatusFromWebhook(id, { status: NotificationStatus.DELIVERED })
      let log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.DELIVERED)
      await updateStatusFromWebhook(id, { status: NotificationStatus.READ })
      log = await prisma.notificationLog.findFirst({ where: { providerMessageId: id } })
      expect(log?.status).toBe(NotificationStatus.READ)
    })
  })

  // -------------------------------------------------------------------------
  // Retry job
  // -------------------------------------------------------------------------

  describe('Notification retry job', () => {
    it('respects MAX_RETRY and backoff timing; permanent-error rows are never retried', async () => {
      const maxRetry = (env as any).WHATSAPP_MAX_RETRY ?? 3
      const now = new Date()

      // Retryable, eligible (failed 10 minutes ago)
      const dedupeRetryable = `retry-eligible-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const retryableId = `PH10-RETRY-ELIGIBLE-${Date.now()}`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} retry eligible`,
          dedupeKey: dedupeRetryable,
          status: NotificationStatus.FAILED,
          providerMessageId: retryableId,
          failedAt: new Date(now.getTime() - 10 * 60 * 1000),
          failureReason: '[retryable] timeout',
          retryCount: 0,
        },
      })

      // Permanent — should be pinned and skipped
      const dedupePerm = `retry-perm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const permanentId = `PH10-RETRY-PERM-${Date.now()}`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} permanent`,
          dedupeKey: dedupePerm,
          status: NotificationStatus.FAILED,
          providerMessageId: permanentId,
          failedAt: new Date(now.getTime() - 10 * 60 * 1000),
          failureReason: '[permanent] Invalid recipient',
          retryCount: 0,
        },
      })

      // Backoff not yet elapsed (failed just now, retryCount 0 => need 1 minute)
      const dedupeBackoff = `retry-backoff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const backoffId = `PH10-RETRY-BACKOFF-${Date.now()}`
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} backoff`,
          dedupeKey: dedupeBackoff,
          status: NotificationStatus.FAILED,
          providerMessageId: backoffId,
          failedAt: now,
          failureReason: '[retryable] timeout',
          retryCount: 0,
        },
      })

      const result = await retryFailedNotifications({ now, limit: 10 })

      // retryable eligible should have been retried (mock provider succeeds -> SENT)
      // After retry providerMessageId is replaced with mock_..., so lookup by dedupeKey
      const retryableLog = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupeRetryable } })
      expect(retryableLog?.status).toBe(NotificationStatus.SENT)

      // permanent should be pinned to MAX_RETRY and still FAILED
      const permLog = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupePerm } })
      expect(permLog?.status).toBe(NotificationStatus.FAILED)
      expect(permLog?.retryCount).toBe(maxRetry)
      expect(result.skippedPermanent).toBeGreaterThanOrEqual(1)

      // backoff should still be FAILED and retryCount unchanged
      const backoffLog = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupeBackoff } })
      expect(backoffLog?.status).toBe(NotificationStatus.FAILED)
      expect(backoffLog?.retryCount).toBe(0)
      expect(result.skippedBackoff).toBeGreaterThanOrEqual(1)
    })

    it('retry increments retryCount and respects exponential backoff (2^retryCount minutes)', async () => {
      const now = new Date()
      const dedupeExp = `retry-exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const id = `PH10-RETRY-EXP-${Date.now()}`
      // retryCount 1 => delay 2 minutes; make failedAt 1 minute ago => should skip
      await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} exp backoff`,
          dedupeKey: dedupeExp,
          status: NotificationStatus.FAILED,
          providerMessageId: id,
          failedAt: new Date(now.getTime() - 1 * 60 * 1000),
          failureReason: '[retryable] timeout',
          retryCount: 1,
        },
      })
      let result = await retryFailedNotifications({ now })
      let log = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupeExp } })
      expect(log?.retryCount).toBe(1) // unchanged — backoff blocked
      expect(result.skippedBackoff).toBeGreaterThanOrEqual(1)

      // Now advance time 5 minutes -> should be eligible (delay 2 min)
      const later = new Date(now.getTime() + 5 * 60 * 1000)
      result = await retryFailedNotifications({ now: later })
      log = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupeExp } })
      expect(log?.status).toBe(NotificationStatus.SENT)
    })
  })

  // -------------------------------------------------------------------------
  // Resend endpoint
  // -------------------------------------------------------------------------

  describe('POST /api/notification-log/:id/resend', () => {
    it('401 when unauthenticated', async () => {
      const res = await request(app).post('/api/notification-log/00000000-0000-0000-0000-000000000000/resend')
      expect(res.status).toBe(401)
    })

    it('404 when id not found', async () => {
      const res = await request(app)
        .post('/api/notification-log/00000000-0000-0000-0000-000000000000/resend')
        .set('Authorization', `Bearer ${ownerToken}`)
      expect(res.status).toBe(404)
    })

    it('creates a new NotificationLog row independent of dedupeKey (mock provider)', async () => {
      const orig = await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} original for resend`,
          dedupeKey: `resend-orig-${Date.now()}-${Math.random()}`,
          status: NotificationStatus.FAILED,
          providerMessageId: `PH10-RESEND-ORIG-${Date.now()}`,
          failedAt: new Date(),
          failureReason: '[retryable] timeout for resend test',
          retryCount: 0,
        },
      })

      const res = await request(app)
        .post(`/api/notification-log/${orig.id}/resend`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).not.toBe(orig.id)
      expect(res.body.data.status).toBe(NotificationStatus.SENT)
      expect(res.body.data.isiRingkas).toBe(orig.isiRingkas)

      const newLog = await prisma.notificationLog.findUnique({ where: { id: res.body.data.id } })
      expect(newLog).toBeTruthy()
      expect(newLog!.dedupeKey).not.toBe(orig.dedupeKey)
      expect(newLog!.dedupeKey).toContain(orig.dedupeKey)

      // orig still exists unchanged
      const stillOrig = await prisma.notificationLog.findUnique({ where: { id: orig.id } })
      expect(stillOrig?.status).toBe(NotificationStatus.FAILED)
    })

    it('resend is cross-property isolated (404 for other property log)', async () => {
      const otherProp = await prisma.property.create({ data: { nama: `${TEST_PREFIX}OtherProp`, alamat: 'other' } })
      const otherLog = await prisma.notificationLog.create({
        data: {
          propertyId: otherProp.id,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628999999999',
          isiRingkas: `${TEST_PREFIX} other prop`,
          dedupeKey: `resend-other-${Date.now()}`,
          status: NotificationStatus.FAILED,
          failureReason: '[retryable] test',
          retryCount: 0,
        },
      })

      const res = await request(app)
        .post(`/api/notification-log/${otherLog.id}/resend`)
        .set('Authorization', `Bearer ${ownerToken}`)
      expect(res.status).toBe(404)

      await prisma.notificationLog.deleteMany({ where: { id: otherLog.id } })
      await prisma.property.deleteMany({ where: { id: otherProp.id } })
    })

    it('resend bypasses dedupeKey — second resend same day still creates new row', async () => {
      const orig = await prisma.notificationLog.create({
        data: {
          propertyId,
          channel: 'WHATSAPP' as any,
          jenis: 'REMINDER_JATUH_TEMPO' as any,
          recipient: '628123456789',
          isiRingkas: `${TEST_PREFIX} dedupe bypass`,
          dedupeKey: `resend-bypass-${Date.now()}-${Math.random()}`,
          status: NotificationStatus.SENT,
          providerMessageId: `PH10-RESEND-BYPASS-${Date.now()}`,
          sentAt: new Date(),
        },
      })

      const first = await request(app)
        .post(`/api/notification-log/${orig.id}/resend`)
        .set('Authorization', `Bearer ${ownerToken}`)
      expect(first.status).toBe(201)

      const second = await request(app)
        .post(`/api/notification-log/${orig.id}/resend`)
        .set('Authorization', `Bearer ${ownerToken}`)
      expect(second.status).toBe(201)
      expect(second.body.data.id).not.toBe(first.body.data.id)
    })
  })
})
