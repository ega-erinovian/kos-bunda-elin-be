import { Router } from 'express'
import { validate } from '../../middlewares/validate.middleware.js'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import {
  createPenyewaSchema,
  updatePenyewaSchema,
  keluarPenyewaSchema,
  idParamsSchema,
  penyewaListQuerySchema,
} from './penyewa.schema.js'
import * as penyewaController from './penyewa.controller.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  validate(penyewaListQuerySchema, 'query'),
  penyewaController.list,
)
router.post('/', requireAuth, validate(createPenyewaSchema), penyewaController.create)
router.get('/:id', requireAuth, validate(idParamsSchema, 'params'), penyewaController.getById)
router.patch(
  '/:id',
  requireAuth,
  validate(idParamsSchema, 'params'),
  validate(updatePenyewaSchema),
  penyewaController.update,
)
router.post(
  '/:id/keluar',
  requireAuth,
  validate(idParamsSchema, 'params'),
  validate(keluarPenyewaSchema),
  penyewaController.keluar,
)

export default router