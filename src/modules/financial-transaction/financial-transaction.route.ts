import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { financialTransactionListQuerySchema, createFinancialTransactionSchema, updateFinancialTransactionSchema } from './financial-transaction.schema.js'
import { z } from 'zod'
import * as controller from './financial-transaction.controller.js'

const reverseSchema = z.object({ reason: z.string().min(1).max(500) })

const router = Router()
router.use(requireAuth)

router.get('/', validate(financialTransactionListQuerySchema, 'query'), controller.list)
router.post('/', validate(createFinancialTransactionSchema), controller.create)
router.patch('/:id', validate(updateFinancialTransactionSchema), controller.update)
router.delete('/:id', requireRole('OWNER'), controller.remove)
router.post('/:id/reverse', requireRole('OWNER'), validate(reverseSchema), controller.reverse)

export default router
