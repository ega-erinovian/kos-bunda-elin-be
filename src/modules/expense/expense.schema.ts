import { z } from 'zod'

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  transactionDate: z.coerce.date().refine((d) => d <= new Date(), { message: 'transactionDate tidak boleh di masa depan' }),
  vendorName: z.string().min(1).max(200),
  receiptUrl: z.string().url().max(500).optional(),
  description: z.string().max(500).optional(),
  referenceNumber: z.string().max(100).optional(),
})

export const listExpenseQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  vendorName: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

export const updateExpenseSchema = z.object({
  vendorName: z.string().min(1).max(200).optional(),
  receiptUrl: z.string().url().max(500).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
})

export const reverseExpenseSchema = z.object({
  reason: z.string().min(1).max(500),
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type ListExpenseQuery = z.infer<typeof listExpenseQuerySchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type ReverseExpenseInput = z.infer<typeof reverseExpenseSchema>
