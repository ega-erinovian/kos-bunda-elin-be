import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { createFinancialAccountSchema, updateFinancialAccountSchema } from './financial-account.schema.js'
import * as controller from './financial-account.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/', controller.list)
router.post('/', validate(createFinancialAccountSchema), controller.create)
router.patch('/:id', validate(updateFinancialAccountSchema), controller.update)

export default router
