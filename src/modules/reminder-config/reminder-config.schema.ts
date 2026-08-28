import { z } from 'zod'

export const reminderConfigUpdateSchema = z.object({
  offsets: z
    .array(z.number().int().min(-30).max(30))
    .min(1, 'offsets tidak boleh kosong')
    .refine((arr) => new Set(arr).size === arr.length, { message: 'offsets harus distinct' })
    .refine((arr) => {
      const sorted = [...arr].sort((a, b) => a - b)
      return JSON.stringify(arr) === JSON.stringify(sorted)
    }, { message: 'offsets harus sorted ascending' }),
  channels: z
    .array(z.enum(['WEB_PUSH', 'WHATSAPP', 'EMAIL', 'SMS']))
    .min(1, 'channels tidak boleh kosong')
    .refine((arr) => new Set(arr).size === arr.length, { message: 'channels harus distinct' }),
  active: z.boolean(),
})

export type ReminderConfigUpdateInput = z.infer<typeof reminderConfigUpdateSchema>
