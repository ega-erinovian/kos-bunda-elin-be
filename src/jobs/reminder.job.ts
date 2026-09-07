import cron from 'node-cron'
import { env } from '../config/env.js'
import logger from '../config/logger.js'
import { runReminderSweep } from '../modules/notification/reminder.service.js'

/**
 * Starts the daily reminder cron.
 */
export function startReminderJob() {
  const schedule = env.REMINDER_CRON_SCHEDULE || '0 8 * * *'
  const tz = env.TZ || 'Asia/Jakarta'

  if (!cron.validate(schedule)) {
    logger.error(`Invalid REMINDER_CRON_SCHEDULE: ${schedule}`)
    return
  }

  logger.info(`Scheduling reminder job with cron "${schedule}" tz=${tz}`)

  cron.schedule(
    schedule,
    async () => {
      const startedAt = Date.now()

      try {
        logger.info('Reminder cron tick — starting sweep')

        const result = await runReminderSweep()

        logger.info(
          {
            sent: result.sent,
            skipped: result.skipped,
            durationMs: Date.now() - startedAt,
          },
          'Reminder cron finished',
        )
      } catch (err) {
        logger.error({ err, durationMs: Date.now() - startedAt }, 'Reminder cron failed')
      }
    },
    { timezone: tz },
  )
}
