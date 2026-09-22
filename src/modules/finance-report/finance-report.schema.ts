import { z } from 'zod'

export const MAX_REPORT_RANGE_DAYS = 1095

export const reportRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({
        path: ['from'],
        code: z.ZodIssueCode.custom,
        message: 'from tidak boleh setelah to',
      })
      ctx.addIssue({
        path: ['to'],
        code: z.ZodIssueCode.custom,
        message: 'to tidak boleh sebelum from',
      })
    }
    if (data.from && data.to) {
      const diffDays = Math.ceil(
        (data.to.getTime() - data.from.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (diffDays > MAX_REPORT_RANGE_DAYS) {
        ctx.addIssue({
          path: ['from'],
          code: z.ZodIssueCode.custom,
          message: `Rentang laporan maksimal ${MAX_REPORT_RANGE_DAYS} hari (3 tahun)`,
        })
      }
    }
  })

export const transactionsReportQuerySchema = reportRangeSchema.extend({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  categoryId: z.string().uuid().optional(),
})

export type ReportRangeQuery = z.infer<typeof reportRangeSchema>
export type TransactionsReportQuery = z.infer<typeof transactionsReportQuerySchema>
