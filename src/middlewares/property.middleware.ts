import type { Request, Response, NextFunction } from 'express'
import { getDefaultPropertyId } from '../config/property.js'

export function resolveProperty(req: Request, _res: Response, next: NextFunction): void {
  if (req.property?.id) {
    next()
    return
  }

  const propertyId = req.user?.propertyId ?? req.admin?.propertyId ?? null

  if (propertyId) {
    req.property = { id: propertyId }
    next()
    return
  }

  try {
    const defaultId = getDefaultPropertyId()
    req.property = { id: defaultId }
    next()
    return
  } catch (err) {
    next(err)
    return
  }
}

export function requireProperty(req: Request, res: Response, next: NextFunction): void {
  if (req.property?.id) {
    next()
    return
  }

  const propertyId = req.user?.propertyId ?? req.admin?.propertyId ?? null

  if (propertyId) {
    req.property = { id: propertyId }
    next()
    return
  }

  res.status(401).json({ success: false, message: 'Property context not available' })
}
