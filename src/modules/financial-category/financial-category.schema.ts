import { z } from 'zod'

export const financialCategoryListQuerySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
})

export const createFinancialCategorySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/, 'code harus huruf kapital / underscore'),
  name: z.string().min(1).max(100),
})

export const updateFinancialCategorySchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/).optional(),
  name: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
})

export type FinancialCategoryListQuery = z.infer<typeof financialCategoryListQuerySchema>
export type CreateFinancialCategoryInput = z.infer<typeof createFinancialCategorySchema>
export type UpdateFinancialCategoryInput = z.infer<typeof updateFinancialCategorySchema>
