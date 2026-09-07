import prisma from '../../config/prisma.js'
import logger from '../../config/logger.js'
import { Prisma, NotificationStatus } from '@prisma/client'
import type { NotificationChannel } from '@prisma/client'
import type { NotificationPayload, NotificationProvider } from './notification.types.js'
import { webPushProvider } from './providers/webpush.provider.js'
import { whatsAppProvider } from './providers/whatsapp.provider.js'

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
    retryCount: 0,
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
  }
  if (event.status === 'SENT') data.sentAt = event.timestamp || new Date()

  return prisma.notificationLog.update({ where: { id: log.id }, data })
}
