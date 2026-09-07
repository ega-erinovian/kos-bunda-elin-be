import 'dotenv/config'
import app from './app.js'
import logger from './config/logger.js'
import { env } from './config/env.js'
import { startReminderJob } from './jobs/reminder.job.js'
import { startNotificationRetryJob } from './modules/notification/notification-retry.job.js'

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`)
  // phase 10: start cron jobs (no-op in test where cron strings may be disabled)
  if (env.NODE_ENV !== 'test') {
    startReminderJob()
    startNotificationRetryJob()
  }
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down')
  server.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down')
  server.close(() => process.exit(0))
})

export default server
