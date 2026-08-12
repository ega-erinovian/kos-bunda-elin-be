import { Router } from 'express'
import { validate } from '../../middlewares/validate.middleware.js'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import {
  createPembayaranSchema,
  updatePembayaranSchema,
  idParamsSchema,
  pembayaranListQuerySchema,
} from './pembayaran.schema.js'
import * as pembayaranController from './pembayaran.controller.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  validate(pembayaranListQuerySchema, 'query'),
  pembayaranController.list,
)
router.post('/', requireAuth, validate(createPembayaranSchema), pembayaranController.create)
router.get('/:id', requireAuth, validate(idParamsSchema, 'params'), pembayaranController.getById)
router.patch(
  '/:id',
  requireAuth,
  validate(idParamsSchema, 'params'),
  validate(updatePembayaranSchema),
  pembayaranController.update,
)

export default router