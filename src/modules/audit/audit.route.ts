import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { auditLogListQuerySchema } from './audit.schema.js'
import * as controller from './audit.controller.js'

const router = Router()
router.use(requireAuth, requireRole('OWNER'))

router.get('/', validate(auditLogListQuerySchema, 'query'), controller.list)

export default router
