/**
 * Push subscription CRUD only — sending logic moved to notification.service + webpush.provider.
 * This module contains only subscribe/unsubscribe and provider adapter coordination.
 */
import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'

export interface PushSubscriptionInput {
  penyewaId: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function subscribe(input: PushSubscriptionInput) {
  const penyewa = await prisma.penyewa.findUnique({ where: { id: input.penyewaId } })
  if (!penyewa) throw new AppError('Penyewa tidak ditemukan', 404)

  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: { penyewaId: input.penyewaId, p256dh: input.p256dh, auth: input.auth },
    create: input,
  })
}

export async function unsubscribe(endpoint: string) {
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } })
  if (!existing) throw new AppError('Subscription tidak ditemukan', 404)
  await prisma.pushSubscription.delete({ where: { endpoint } })
  return { success: true }
}

export async function listByPenyewa(penyewaId: string) {
  return prisma.pushSubscription.findMany({ where: { penyewaId } })
}

export async function removeByPenyewa(penyewaId: string, endpoint: string) {
  const sub = await prisma.pushSubscription.findFirst({ where: { penyewaId, endpoint } })
  if (!sub) throw new AppError('Subscription tidak ditemukan', 404)
  await prisma.pushSubscription.delete({ where: { id: sub.id } })
  return { success: true }
}
