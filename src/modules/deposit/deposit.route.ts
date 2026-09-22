import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { createDepositSchema, listDepositQuerySchema, deductDepositSchema, refundDepositSchema, idParamsSchema } from './deposit.schema.js'
import * as controller from './deposit.controller.js'

const router = Router()

router.use(requireAuth)

router.post('/', validate(createDepositSchema), controller.create)
router.get('/', validate(listDepositQuerySchema, 'query'), controller.list)
router.patch('/:id/deduct', validate(idParamsSchema, 'params'), validate(deductDepositSchema), controller.deduct)
router.post('/:id/refund', validate(idParamsSchema, 'params'), validate(refundDepositSchema), controller.refund)

export default router
