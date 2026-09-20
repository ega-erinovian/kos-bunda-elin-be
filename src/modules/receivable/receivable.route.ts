import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { receivableQuerySchema } from './receivable.schema.js'
import * as controller from './receivable.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/summary', validate(receivableQuerySchema, 'query'), controller.summary)
router.get('/aging', validate(receivableQuerySchema, 'query'), controller.aging)
router.get('/', validate(receivableQuerySchema, 'query'), controller.list)

export default router
