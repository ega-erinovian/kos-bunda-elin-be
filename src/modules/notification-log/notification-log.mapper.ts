export function mapNotificationLog(log: any) {
  return {
    id: log.id,
    channel: log.channel,
    jenis: log.jenis,
    recipient: log.recipient,
    status: log.status,
    isiRingkas: log.isiRingkas,
    sentAt: log.sentAt?.toISOString ? log.sentAt.toISOString() : log.sentAt || undefined,
    deliveredAt: log.deliveredAt?.toISOString ? log.deliveredAt.toISOString() : log.deliveredAt || undefined,
    readAt: log.readAt?.toISOString ? log.readAt.toISOString() : log.readAt || undefined,
    failedAt: log.failedAt?.toISOString ? log.failedAt.toISOString() : log.failedAt || undefined,
    failureReason: log.failureReason || undefined,
  }
}
