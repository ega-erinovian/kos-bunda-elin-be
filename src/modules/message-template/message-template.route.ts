import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import {
  messageTemplateListQuerySchema,
  createMessageTemplateSchema,
  updateMessageTemplateSchema,
} from './message-template.schema.js'
import * as controller from './message-template.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', validate(messageTemplateListQuerySchema, 'query'), controller.list)

router.post(
  '/',
  requireRole('OWNER'),
  validate(createMessageTemplateSchema),
  controller.create
)

router.patch(
  '/:id',
  requireRole('OWNER'),
  validate(updateMessageTemplateSchema),
  controller.update
)

export default router
