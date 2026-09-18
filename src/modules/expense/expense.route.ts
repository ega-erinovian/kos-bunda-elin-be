import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { createExpenseSchema, listExpenseQuerySchema, updateExpenseSchema, reverseExpenseSchema, idParamsSchema } from './expense.schema.js'
import * as controller from './expense.controller.js'

const router = Router()

router.use(requireAuth)

router.post('/', validate(createExpenseSchema), controller.create)
router.get('/', validate(listExpenseQuerySchema, 'query'), controller.list)
router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateExpenseSchema), controller.update)
router.post('/:id/reverse', validate(idParamsSchema, 'params'), requireRole('OWNER'), validate(reverseExpenseSchema), controller.reverse)

export default router
