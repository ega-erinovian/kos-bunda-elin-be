import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import { mapNotificationLog } from '../notification-log/notification-log.mapper.js'
import * as reminderService from './reminder.service.js'

/**
 * POST /api/notification/reminders/send
 */
export async function sendManual(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const propertyId = getRequestPropertyId(req)
    const { pembayaranId, penyewaId } = req.body as {
      pembayaranId?: string
      penyewaId?: string
    }

    const result = await reminderService.sendManualReminder({
      propertyId,
      pembayaranId,
      penyewaId,
    })

    const sent = result.sent.map(mapNotificationLog)

    res.status(200).json({
      success: true,
      data: {
        sent,
        skipped: result.skipped,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/notification/reminders/run-sweep
 */
export async function runSweep(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const propertyId = getRequestPropertyId(req)

    const result = await reminderService.runReminderSweep({ propertyId })

    res.status(200).json({
      success: true,
      data: {
        sent: result.sent,
        skipped: result.skipped,
      },
    })
  } catch (err) {
    next(err)
  }
}
