import cron from 'node-cron'
import { env } from '../config/env.js'
import logger from '../config/logger.js'
import prisma from '../config/prisma.js'

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
      try {
        logger.info('Reminder cron tick — placeholder (Phase 9 will implement sweep)')
        
        const configs = await prisma.reminderConfig.findMany({
          where: { active: true },
          select: { propertyId: true, offsets: true, channels: true },
        })
        logger.info({ count: configs.length }, 'Reminder configs active')
      } catch (err) {
        logger.error({ err }, 'Reminder cron failed')
      }
    },
    { timezone: tz }
  )
}
