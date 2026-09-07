import type { NotificationChannel, NotificationStatus, JenisPesan } from '@prisma/client'

export interface NotificationPayload {
  propertyId: string
  penyewaId?: string | null
  pembayaranId?: string | null
  channel: NotificationChannel
  jenis: JenisPesan
  recipient: string
  isiRingkas: string
  templateData?: Record<string, string | number>
}

export interface NotificationProviderResult {
  providerMessageId?: string
  status: NotificationStatus
  failureReason?: string
}

export interface NotificationProvider {
  channel: NotificationChannel
  send(payload: NotificationPayload): Promise<NotificationProviderResult>
}

export interface SendNotificationResult {
  logId: string
  status: NotificationStatus
  providerMessageId?: string
  deduped?: boolean
}
