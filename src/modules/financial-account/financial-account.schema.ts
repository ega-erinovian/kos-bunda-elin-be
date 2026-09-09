import { z } from 'zod'

export const createFinancialAccountSchema = z.object({
  name: z.string().min(1, 'name tidak boleh kosong').max(100),
  type: z.enum(['CASH', 'BANK', 'E_WALLET', 'QRIS', 'OTHER']),
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().max(100).optional(),
  openingBalance: z.number().min(0).or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)).default(0),
})

export const updateFinancialAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['CASH', 'BANK', 'E_WALLET', 'QRIS', 'OTHER']).optional(),
  bankName: z.string().max(100).optional().nullable(),
  accountNumber: z.string().max(100).optional().nullable(),
  openingBalance: z.number().min(0).or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)).optional(),
  active: z.boolean().optional(),
})

export type CreateFinancialAccountInput = z.infer<typeof createFinancialAccountSchema>
export type UpdateFinancialAccountInput = z.infer<typeof updateFinancialAccountSchema>
