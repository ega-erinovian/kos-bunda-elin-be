import { env } from './env.js'
import { AppError } from '../utils/apiError.js'

export function getDefaultPropertyId(): string {
  if (!env.DEFAULT_PROPERTY_ID) {
    throw new AppError('DEFAULT_PROPERTY_ID is not configured in .env', 500)
  }
  return env.DEFAULT_PROPERTY_ID
}
