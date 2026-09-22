import { z } from 'zod'

export const createDepositSchema = z.object({
  penyewaId: z.string().uuid(),
  amountReceived: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  receivedDate: z.coerce.date().refine((d) => d <= new Date(Date.now() + 86400000), {
    message: 'receivedDate tidak boleh di masa depan',
  }),
})

export const listDepositQuerySchema = z.object({
  penyewaId: z.string().uuid().optional(),
  status: z.enum(['HELD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FORFEITED']).optional(),
})

export const deductDepositSchema = z.object({
  deductionAmount: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  deductionReason: z.string().min(1).max(500),
})

export const refundDepositSchema = z.object({
  refundAmount: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  refundDate: z.coerce.date().refine((d) => d <= new Date(), {
    message: 'refundDate tidak boleh di masa depan',
  }),
})

export const idParamsSchema = z.object({ id: z.string().uuid() })

export type CreateDepositInput = z.infer<typeof createDepositSchema>
export type ListDepositQuery = z.infer<typeof listDepositQuerySchema>
export type DeductDepositInput = z.infer<typeof deductDepositSchema>
export type RefundDepositInput = z.infer<typeof refundDepositSchema>
