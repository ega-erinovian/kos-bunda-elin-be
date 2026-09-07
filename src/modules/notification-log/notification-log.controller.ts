import { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './notification-log.service.js'
import { resendNotificationLog } from '../notification/notification.service.js'
import { mapNotificationLog } from './notification-log.mapper.js'
import type { NotificationLogListQuery } from './notification-log.schema.js'
import { AppError } from '../../utils/apiError.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as NotificationLogListQuery
    const result = await service.getNotificationLogs(query)
    const mapped = result.data.map(mapNotificationLog)
    return res.json({ success: true, data: mapped, pagination: result.pagination })
  } catch (err) {
    next(err)
  }
}

export async function resend(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const { id } = req.params as { id: string }
    const log = await resendNotificationLog(id, propertyId)
    if (!log) throw new AppError('NotificationLog tidak ditemukan', 404)
    return res.status(201).json({ success: true, data: mapNotificationLog(log) })
  } catch (err) {
    next(err)
  }
}
