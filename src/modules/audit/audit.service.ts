import prisma from '../../config/prisma.js'
import { Prisma } from '@prisma/client'

type WriteAuditParams = {
  propertyId?: string | null
  adminId?: string | null
  entity: string
  entityId: string
  action: string
  beforeValue?: unknown
  afterValue?: unknown
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient | typeof prisma,
  params: WriteAuditParams,
) {
  return (tx as any).auditLog.create({
    data: {
      propertyId: params.propertyId || null,
      adminId: params.adminId || null,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      beforeValue: params.beforeValue as any,
      afterValue: params.afterValue as any,
    },
  })
}

export async function listAuditLogs(query: {
  propertyId?: string
  entity?: string
  entityId?: string
  from?: Date
  to?: Date
}) {
  const where: Prisma.AuditLogWhereInput = {}
  if (query.propertyId) where.propertyId = query.propertyId
  if (query.entity) where.entity = query.entity
  if (query.entityId) where.entityId = query.entityId
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = query.from
    if (query.to) where.createdAt.lte = query.to
  }
  const data = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return data
}
