import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { notificationLogListQuerySchema } from './notification-log.schema.js'
import * as controller from './notification-log.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', validate(notificationLogListQuerySchema, 'query'), controller.list)

export default router
