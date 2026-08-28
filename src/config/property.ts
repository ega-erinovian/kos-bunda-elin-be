import { env } from './env.js'
import { AppError } from '../utils/apiError.js'
import type { Request } from 'express'

export function getDefaultPropertyId(): string {
  if (!env.DEFAULT_PROPERTY_ID) {
    throw new AppError('DEFAULT_PROPERTY_ID is not configured in .env', 500)
  }
  return env.DEFAULT_PROPERTY_ID
}

export function getRequestPropertyId(req: Request): string {
  const fromReq = (req as any).property?.id || (req as any).admin?.propertyId || (req as any).user?.propertyId
  if (fromReq) return fromReq
  return getDefaultPropertyId()
}
