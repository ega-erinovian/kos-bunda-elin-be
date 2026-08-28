import { Request, Response, NextFunction } from 'express'
import * as service from './notification-log.service.js'
import { mapNotificationLog } from './notification-log.mapper.js'
import type { NotificationLogListQuery } from './notification-log.schema.js'

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
