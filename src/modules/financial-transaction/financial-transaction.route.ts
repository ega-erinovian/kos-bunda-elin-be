import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { financialTransactionListQuerySchema, createFinancialTransactionSchema, updateFinancialTransactionSchema } from './financial-transaction.schema.js'
import * as controller from './financial-transaction.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/', validate(financialTransactionListQuerySchema, 'query'), controller.list)
router.post('/', validate(createFinancialTransactionSchema), controller.create)
router.patch('/:id', validate(updateFinancialTransactionSchema), controller.update)
router.delete('/:id', requireRole('OWNER'), controller.remove)

export default router
