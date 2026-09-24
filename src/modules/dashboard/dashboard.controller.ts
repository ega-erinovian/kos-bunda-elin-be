import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './dashboard.service.js'
import { mapDashboardSummary } from './dashboard.mapper.js'

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getDashboardSummary(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data: mapDashboardSummary(data) })
  } catch (err) {
    next(err)
  }
}
