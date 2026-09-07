import webpush from 'web-push'
import prisma from '../../../config/prisma.js'
import { env } from '../../../config/env.js'
import logger from '../../../config/logger.js'
import type { NotificationPayload, NotificationProvider, NotificationProviderResult } from '../notification.types.js'
import { NotificationStatus } from '@prisma/client'

let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    try {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
      vapidConfigured = true
      logger.info('VAPID configured for web-push')
    } catch (e) {
      logger.error({ err: e }, 'Failed to configure VAPID')
    }
  } else {
    logger.warn('VAPID keys not configured — web-push will fail gracefully')
  }
}

export const webPushProvider: NotificationProvider = {
  channel: 'WEB_PUSH',
  async send(payload: NotificationPayload): Promise<NotificationProviderResult> {
    ensureVapidConfigured()

    // Find push subscriptions for this tenant
    if (!payload.penyewaId) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: 'No penyewaId for WEB_PUSH — cannot resolve subscriptions',
      }
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { penyewaId: payload.penyewaId },
    })

    if (subscriptions.length === 0) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: 'No push subscriptions for tenant',
      }
    }

    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: 'VAPID not configured',
      }
    }

    const pushPayload = JSON.stringify({
      title: payload.jenis === 'REMINDER_JATUH_TEMPO' ? 'Pengingat Jatuh Tempo' : payload.jenis === 'REMINDER_TUNGGAKAN' ? 'Pengingat Tunggakan' : 'Pengumuman',
      body: payload.isiRingkas,
      channel: payload.channel,
      jenis: payload.jenis,
    })

    let successCount = 0
    let lastError: string | undefined

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, pushPayload)
        successCount++
      } catch (err: any) {
        const statusCode = err?.statusCode
        const body = err?.body || err?.message
        lastError = `status ${statusCode}: ${body}`

        // Handle expired/invalid subscriptions: 410 Gone, 404
        if (statusCode === 410 || statusCode === 404) {
          logger.info({ endpoint: sub.endpoint }, 'Removing expired push subscription')
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }

        logger.warn({ err, endpoint: sub.endpoint }, 'web-push send failed')
      }
    }

    if (successCount > 0) {
      return { status: NotificationStatus.SENT }
    }

    return {
      status: NotificationStatus.FAILED,
      failureReason: lastError || 'All push subscriptions failed',
    }
  },
}
