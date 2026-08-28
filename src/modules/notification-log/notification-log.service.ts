import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { Prisma } from '@prisma/client'
import type { NotificationLogListQuery } from './notification-log.schema.js'

export async function getNotificationLogs(query: NotificationLogListQuery) {
  const propertyId = getDefaultPropertyId()

  const where: Prisma.NotificationLogWhereInput = { propertyId }

  if (query.penyewaId) where.penyewaId = query.penyewaId
  if (query.channel) where.channel = query.channel as any
  if (query.status) where.status = query.status as any

  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = query.from
    if (query.to) where.createdAt.lte = query.to
  }

  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50

  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationLog.count({ where }),
  ])

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
