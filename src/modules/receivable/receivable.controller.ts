import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './receivable.service.js'

function resolveAsOf(req: Request): Date {
  const raw = (req.query as any)?.asOf as Date | string | undefined
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw
  if (typeof raw === 'string') {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const asOf = resolveAsOf(req)
    const data = await service.getReceivables(propertyId, asOf)
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const asOf = resolveAsOf(req)
    const data = await service.getSummary(propertyId, asOf)
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function aging(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const asOf = resolveAsOf(req)
    const data = await service.getAging(propertyId, asOf)
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
