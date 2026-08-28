import { z } from 'zod'

export const pushSubscribeSchema = z.object({
  penyewaId: z.string().uuid(),
  endpoint: z.string().url().or(z.string().min(1)), // web-push endpoint is URL but allow custom if needed
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1),
})

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>
