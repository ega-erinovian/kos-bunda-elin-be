import z from 'zod'

/**
 * Body for POST /api/notification/reminders/send
 */
export const sendReminderSchema = z
  .object({
    pembayaranId: z.string().uuid({ message: 'pembayaranId must be a valid UUID' }).optional(),
    penyewaId: z.string().uuid({ message: 'penyewaId must be a valid UUID' }).optional(),
  })
  .superRefine((data, ctx) => {
    const hasPembayaran = Boolean(data.pembayaranId)
    const hasPenyewa = Boolean(data.penyewaId)

    if (hasPembayaran === hasPenyewa) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of pembayaranId or penyewaId',
        path: ['pembayaranId'],
      })
    }
  })

export type SendReminderInput = z.infer<typeof sendReminderSchema>
