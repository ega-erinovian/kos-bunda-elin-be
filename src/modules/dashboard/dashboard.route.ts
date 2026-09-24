import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { dashboardSummaryQuerySchema } from './dashboard.schema.js'
import * as controller from './dashboard.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/summary', validate(dashboardSummaryQuerySchema, 'query'), controller.summary)

export default router
