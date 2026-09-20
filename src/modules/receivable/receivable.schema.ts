import { z } from 'zod'
import { startOfDay } from 'date-fns'

export const receivableQuerySchema = z.object({
  asOf: z.coerce
    .date()
    .refine((d) => startOfDay(d) <= startOfDay(new Date()), {
      message: 'asOf tidak boleh di masa depan',
    })
    .optional(),
})

export type ReceivableQuery = z.infer<typeof receivableQuerySchema>
