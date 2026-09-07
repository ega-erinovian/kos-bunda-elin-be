import cron from 'node-cron'
import { env } from '../../config/env.js'
import logger from '../../config/logger.js'
import { retryFailedNotifications } from './notification.service.js'

export function startNotificationRetryJob() {
  const schedule = (env as any).NOTIFICATION_RETRY_CRON_SCHEDULE || '*/15 * * * *'
  const tz = env.TZ || 'Asia/Jakarta'

  if (!cron.validate(schedule)) {
    logger.error(`Invalid NOTIFICATION_RETRY_CRON_SCHEDULE: ${schedule}`)
    return
  }

  logger.info(`Scheduling notification retry job with cron "${schedule}" tz=${tz}`)

  cron.schedule(
    schedule,
    async () => {
      const startedAt = Date.now()
      try {
        logger.info('Notification retry tick — starting sweep')
        const result = await retryFailedNotifications()
        logger.info(
          { retried: result.retried, skippedBackoff: result.skippedBackoff, durationMs: Date.now() - startedAt },
          'Notification retry finished',
        )
      } catch (err) {
        logger.error({ err, durationMs: Date.now() - startedAt }, 'Notification retry failed')
      }
    },
    { timezone: tz },
  )
}

// For manual trigger/tests — runs one sweep immediately
export async function runRetryOnce() {
  return retryFailedNotifications()
}
