import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { sendReminderSchema } from './notification.schema.js'
import * as controller from './notification.controller.js'

const router = Router()

router.use(requireAuth)

/**
 * POST /api/notification/reminders/send
 * Body: { pembayaranId } | { penyewaId }
 */
router.post('/reminders/send', validate(sendReminderSchema, 'body'), controller.sendManual)

/**
 * POST /api/notification/reminders/run-sweep
 */
router.post('/reminders/run-sweep', requireRole('OWNER'), controller.runSweep)

export default router
