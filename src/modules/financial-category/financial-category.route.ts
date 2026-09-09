import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { financialCategoryListQuerySchema, createFinancialCategorySchema, updateFinancialCategorySchema } from './financial-category.schema.js'
import * as controller from './financial-category.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/', validate(financialCategoryListQuerySchema, 'query'), controller.list)
router.post('/', validate(createFinancialCategorySchema), controller.create)
router.patch('/:id', validate(updateFinancialCategorySchema), controller.update)

export default router
