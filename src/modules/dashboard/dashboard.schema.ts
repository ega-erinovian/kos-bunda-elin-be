import { reportRangeSchema } from '../finance-report/finance-report.schema.js'
import { z } from 'zod'

export const dashboardSummaryQuerySchema = reportRangeSchema

export type DashboardSummaryQuery = z.infer<typeof reportRangeSchema>
