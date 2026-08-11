import { Router } from 'express'
import { validate } from '../../middlewares/validate.middleware.js'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import {
  createKamarSchema,
  updateKamarSchema,
  idParamsSchema,
  kamarListQuerySchema,
} from './kamar.schema.js'
import * as kamarController from './kamar.controller.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  validate(kamarListQuerySchema, 'query'),
  kamarController.list,
)
router.post('/', requireAuth, validate(createKamarSchema), kamarController.create)
router.get('/:id', requireAuth, validate(idParamsSchema, 'params'), kamarController.getById)
router.patch(
  '/:id',
  requireAuth,
  validate(idParamsSchema, 'params'),
  validate(updateKamarSchema),
  kamarController.update,
)
router.delete(
  '/:id',
  requireAuth,
  requireRole('OWNER'),
  validate(idParamsSchema, 'params'),
  kamarController.remove,
)

export default router