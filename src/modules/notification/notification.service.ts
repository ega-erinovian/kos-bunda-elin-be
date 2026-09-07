import prisma from '../../config/prisma.js'
import logger from '../../config/logger.js'
import { Prisma, NotificationStatus } from '@prisma/client'
import type { NotificationChannel } from '@prisma/client'
import type { NotificationPayload, NotificationProvider } from './notification.types.js'
import { webPushProvider } from './providers/webpush.provider.js'
import { whatsAppProvider } from './providers/whatsapp.provider.js'
import { env } from '../../config/env.js'

const providers: Partial<Record<NotificationChannel, NotificationProvider>> = {
  WEB_PUSH: webPushProvider,
  WHATSAPP: whatsAppProvider,
}

/**
 * Computes dedupeKey to prevent duplicate messages at DB level.
 * Format: `${pembayaranId}:${channel}:${jenis}:${YYYY-MM-DD}`
 * Falls back to penyewaId if pembayaranId absent, and to recipient hash if both missing.
 */
export function computeDedupeKey(
  payload: NotificationPayload,
  date: Date = new Date()
): string {
  const yyyyMMdd = date.toISOString().slice(0, 10)
  const entityPart = payload.pembayaranId || payload.penyewaId || payload.recipient
  return `${entityPart}:${payload.channel}:${payload.jenis}:${yyyyMMdd}`
}

export async function sendNotification(
  payload: NotificationPayload,
  opts?: { dedupeDate?: Date },
) {
  const dedupeKey = computeDedupeKey(payload, opts?.dedupeDate ?? new Date())
  const provider = providers[payload.channel]

  if (!provider) {
    throw new Error(`No provider registered for channel ${payload.channel}`)
  }

  let providerResult: { status: NotificationStatus; providerMessageId?: string; failureReason?: string }
  try {
    providerResult = await provider.send(payload)
  } catch (err: any) {
    logger.error({ err, payload }, 'Provider threw exception')
    providerResult = {
      status: NotificationStatus.FAILED,
      failureReason: err?.message || 'Provider exception',
    }
  }

  const now = new Date()
  const status = providerResult.status
  // Permanent failures pin retryCount = MAX_RETRY so retry job skips them (Phase 10)
  const isPermanent = typeof providerResult.failureReason === 'string' && providerResult.failureReason.includes('[permanent]')
  const initialRetryCount = status === NotificationStatus.FAILED && isPermanent ? (env as any).WHATSAPP_MAX_RETRY ?? 3 : 0
  const logData: Prisma.NotificationLogCreateInput = {
    property: { connect: { id: payload.propertyId } },
    channel: payload.channel,
    jenis: payload.jenis,
    recipient: payload.recipient,
    isiRingkas: payload.isiRingkas,
    dedupeKey,
    status,
    providerMessageId: providerResult.providerMessageId || null,
    sentAt: status === NotificationStatus.SENT ? now : null,
    failedAt: status === NotificationStatus.FAILED ? now : null,
    failureReason: providerResult.failureReason || null,
    retryCount: initialRetryCount,
    ...(payload.penyewaId ? { penyewa: { connect: { id: payload.penyewaId } } } : {}),
    ...(payload.pembayaranId ? { pembayaran: { connect: { id: payload.pembayaranId } } } : {}),
  }

  try {
    const log = await prisma.notificationLog.create({ data: logData })
    return { log, deduped: false }
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const rawTarget = (err.meta?.target ?? '') as unknown
      const targetStr = Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget)
      if (targetStr.includes('dedupeKey') || targetStr === '') {
        logger.info({ dedupeKey, meta: err.meta }, 'Duplicate notification suppressed via dedupeKey')
        const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey } })
        return { log: existing, deduped: true }
      }
    }
    throw err
  }
}

export async function updateStatusFromWebhook(
  providerMessageId: string,
  event: { status: NotificationStatus; timestamp?: Date; failureReason?: string }
) {
  const log = await prisma.notificationLog.findFirst({
    where: { providerMessageId },
  })
  if (!log) {
    logger.warn({ providerMessageId }, 'Webhook: no NotificationLog found for providerMessageId')
    return null
  }

  const data: Prisma.NotificationLogUpdateInput = {
    status: event.status,
  }

  if (event.status === 'DELIVERED') data.deliveredAt = event.timestamp || new Date()
  if (event.status === 'READ') data.readAt = event.timestamp || new Date()
  if (event.status === 'FAILED') {
    data.failedAt = event.timestamp || new Date()
    data.failureReason = event.failureReason || log.failureReason
    // If webhook indicates permanent failure, pin retryCount
    if (event.failureReason && event.failureReason.includes('[permanent]')) {
      ;(data as any).retryCount = (env as any).WHATSAPP_MAX_RETRY ?? 3
    }
  }
  if (event.status === 'SENT') data.sentAt = event.timestamp || new Date()

  return prisma.notificationLog.update({ where: { id: log.id }, data })
}

// ---------------------------------------------------------------------------
// Resend — creates a brand new NotificationLog bypassing dedupeKey (Phase 10)
// ---------------------------------------------------------------------------

export async function resendNotificationLog(originalId: string, propertyId: string) {
  const original = await prisma.notificationLog.findFirst({
    where: { id: originalId, propertyId },
  })
  if (!original) return null

  const payload: NotificationPayload = {
    propertyId: original.propertyId,
    penyewaId: original.penyewaId,
    pembayaranId: original.pembayaranId,
    channel: original.channel as NotificationChannel,
    jenis: original.jenis as any,
    recipient: original.recipient,
    isiRingkas: original.isiRingkas,
  }

  const provider = providers[payload.channel]
  if (!provider) throw new Error(`No provider registered for channel ${payload.channel}`)

  let providerResult: { status: NotificationStatus; providerMessageId?: string; failureReason?: string }
  try {
    providerResult = await provider.send(payload)
  } catch (err: any) {
    providerResult = { status: NotificationStatus.FAILED, failureReason: err?.message || 'Provider exception' }
  }

  const now = new Date()
  const isPermanent =
    typeof providerResult.failureReason === 'string' && providerResult.failureReason.includes('[permanent]')
  const dedupeKey = `${original.dedupeKey}:resend:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`

  const log = await prisma.notificationLog.create({
    data: {
      property: { connect: { id: original.propertyId } },
      channel: original.channel,
      jenis: original.jenis,
      recipient: original.recipient,
      isiRingkas: original.isiRingkas,
      dedupeKey,
      status: providerResult.status,
      providerMessageId: providerResult.providerMessageId || null,
      sentAt: providerResult.status === NotificationStatus.SENT ? now : null,
      failedAt: providerResult.status === NotificationStatus.FAILED ? now : null,
      failureReason: providerResult.failureReason || null,
      retryCount: isPermanent ? ((env as any).WHATSAPP_MAX_RETRY ?? 3) : 0,
      ...(original.penyewaId ? { penyewa: { connect: { id: original.penyewaId } } } : {}),
      ...(original.pembayaranId ? { pembayaran: { connect: { id: original.pembayaranId } } } : {}),
    },
  })

  return log
}

// ---------------------------------------------------------------------------
// Retry — exponential backoff: skip if failedAt < 2^retryCount minutes ago
// ---------------------------------------------------------------------------

export async function retryFailedNotifications(opts?: { now?: Date; limit?: number }) {
  const now = opts?.now ?? new Date()
  const limit = opts?.limit ?? 50
  const maxRetry = (env as any).WHATSAPP_MAX_RETRY ?? 3

  const candidates = await prisma.notificationLog.findMany({
    where: {
      status: NotificationStatus.FAILED,
      retryCount: { lt: maxRetry },
    },
    orderBy: { failedAt: 'asc' },
    take: limit,
  })

  let retried = 0
  let skippedBackoff = 0
  let skippedPermanent = 0
  const results: Array<{ id: string; status: NotificationStatus }> = []

  for (const log of candidates) {
    // Permanent guard already handled by retryCount pin, but also check failureReason
    if (log.failureReason && log.failureReason.includes('[permanent]')) {
      // pin if not already
      if (log.retryCount < maxRetry) {
        await prisma.notificationLog.update({ where: { id: log.id }, data: { retryCount: maxRetry } })
      }
      skippedPermanent++
      continue
    }

    if (log.failedAt) {
      const delayMinutes = Math.pow(2, log.retryCount)
      const nextRetryAt = new Date(log.failedAt.getTime() + delayMinutes * 60 * 1000)
      if (now < nextRetryAt) {
        skippedBackoff++
        continue
      }
    }

    const payload: NotificationPayload = {
      propertyId: log.propertyId,
      penyewaId: log.penyewaId,
      pembayaranId: log.pembayaranId,
      channel: log.channel as NotificationChannel,
      jenis: log.jenis as any,
      recipient: log.recipient,
      isiRingkas: log.isiRingkas,
    }
    const provider = providers[payload.channel]
    if (!provider) {
      skippedPermanent++
      continue
    }

    let providerResult: { status: NotificationStatus; providerMessageId?: string; failureReason?: string }
    try {
      providerResult = await provider.send(payload)
    } catch (err: any) {
      providerResult = { status: NotificationStatus.FAILED, failureReason: err?.message || 'Provider exception' }
    }

    const isPermanentRetry =
      typeof providerResult.failureReason === 'string' && providerResult.failureReason.includes('[permanent]')
    const newRetryCount = isPermanentRetry ? maxRetry : log.retryCount + 1

    if (providerResult.status === NotificationStatus.SENT) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.SENT,
          providerMessageId: providerResult.providerMessageId || log.providerMessageId,
          sentAt: now,
          failedAt: null,
          failureReason: null,
          retryCount: newRetryCount,
        },
      })
      retried++
      results.push({ id: log.id, status: NotificationStatus.SENT })
    } else {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: now,
          failureReason: providerResult.failureReason || log.failureReason,
          retryCount: newRetryCount,
          ...(providerResult.providerMessageId ? { providerMessageId: providerResult.providerMessageId } : {}),
        },
      })
      // Still counts as attempted; if now pinned, next loop will skip
      retried++
      results.push({ id: log.id, status: NotificationStatus.FAILED })
    }
  }

  logger.info({ retried, skippedBackoff, skippedPermanent, maxRetry }, 'Retry sweep finished')
  return { retried, skippedBackoff, skippedPermanent, results }
}
