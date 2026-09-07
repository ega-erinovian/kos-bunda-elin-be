import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { reminderConfigUpdateSchema } from './reminder-config.schema.js'
import * as controller from './reminder-config.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', controller.get)
router.patch('/', requireRole('OWNER'), validate(reminderConfigUpdateSchema), controller.update)

export default router
