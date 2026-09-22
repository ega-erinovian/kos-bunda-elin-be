import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { reportRangeSchema, transactionsReportQuerySchema } from './finance-report.schema.js'
import { receivableQuerySchema } from '../receivable/receivable.schema.js'
import * as controller from './finance-report.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/receivables/aging', validate(receivableQuerySchema, 'query'), controller.receivablesAging)
router.get('/receivables', validate(receivableQuerySchema, 'query'), controller.receivables)

router.get('/dashboard', validate(reportRangeSchema, 'query'), controller.dashboard)
router.get('/transactions', validate(transactionsReportQuerySchema, 'query'), controller.transactions)
router.get('/revenue', validate(reportRangeSchema, 'query'), controller.revenue)
router.get('/expenses', validate(reportRangeSchema, 'query'), controller.expenses)
router.get('/cash-flow', validate(reportRangeSchema, 'query'), controller.cashFlow)
router.get('/income-statement', validate(reportRangeSchema, 'query'), controller.incomeStatement)

export default router
