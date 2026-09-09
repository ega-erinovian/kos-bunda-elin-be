import { z } from 'zod'

export const financialTransactionListQuerySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

export const createFinancialTransactionSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  transactionDate: z.coerce.date().refine((d) => d <= new Date(Date.now() + 24*60*60*1000), { message: 'transactionDate tidak boleh di masa depan' }),
  description: z.string().max(500).optional(),
  referenceNumber: z.string().max(100).optional(),
  source: z.enum(['MANUAL_INCOME', 'MANUAL_EXPENSE']),
})

export const updateFinancialTransactionSchema = z.object({
  description: z.string().max(500).optional().nullable(),
  referenceNumber: z.string().max(100).optional().nullable(),
  categoryId: z.string().uuid().optional(),
})

export type FinancialTransactionListQuery = z.infer<typeof financialTransactionListQuerySchema>
export type CreateFinancialTransactionInput = z.infer<typeof createFinancialTransactionSchema>
export type UpdateFinancialTransactionInput = z.infer<typeof updateFinancialTransactionSchema>
