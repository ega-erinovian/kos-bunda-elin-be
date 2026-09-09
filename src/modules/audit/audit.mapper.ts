export function mapAuditLog(log: any) {
  return {
    id: log.id,
    entity: log.entity,
    entityId: log.entityId,
    action: log.action,
    beforeValue: log.beforeValue ?? undefined,
    afterValue: log.afterValue ?? undefined,
    adminId: log.adminId ?? undefined,
    createdAt: log.createdAt.toISOString(),
  }
}
