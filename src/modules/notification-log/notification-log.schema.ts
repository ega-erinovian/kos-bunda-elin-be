import { z } from 'zod'

export const notificationLogListQuerySchema = z.object({
  penyewaId: z.string().uuid().optional(),
  channel: z.enum(['WEB_PUSH', 'WHATSAPP', 'EMAIL', 'SMS']).optional(),
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

export type NotificationLogListQuery = z.infer<typeof notificationLogListQuerySchema>
