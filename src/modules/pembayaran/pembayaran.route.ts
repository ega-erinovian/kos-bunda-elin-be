import { Router } from 'express'
import * as pembayaranController from './pembayaran.controller.js'
import { validate } from '../../middlewares/validate.middleware.js'
import {
  pembayaranListQuerySchema,
  createPembayaranSchema,
  updatePembayaranSchema,
} from './pembayaran.schema.js'

const router = Router()

router.get('/', validate(pembayaranListQuerySchema, 'query'), pembayaranController.list)

router.get('/:id', pembayaranController.getById)

router.post('/', validate(createPembayaranSchema, 'body'), pembayaranController.create)

router.patch('/:id', validate(updatePembayaranSchema, 'body'), pembayaranController.update)

export default router
