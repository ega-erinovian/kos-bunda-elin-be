import { Request, Response, NextFunction } from 'express'
import * as service from './reminder-config.service.js'
import { mapReminderConfig } from './reminder-config.mapper.js'
import { apiSuccess } from '../../utils/apiResponse.js'

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await service.getReminderConfig()
    return apiSuccess(res, mapReminderConfig(config))
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await service.updateReminderConfig(req.body)
    return apiSuccess(res, mapReminderConfig(config))
  } catch (err) {
    next(err)
  }
}
