import { env } from './env.js'
import { AppError } from '../utils/apiError.js'
import type { Request } from 'express'

/**
 * Returns the default property id configured via `DEFAULT_PROPERTY_ID`.
 * Single-property deployments (v1) rely on this as the sole source of truth.
 */
export function getDefaultPropertyId(): string {
  if (!env.DEFAULT_PROPERTY_ID) {
    throw new AppError('DEFAULT_PROPERTY_ID is not configured in .env', 500)
  }
  return env.DEFAULT_PROPERTY_ID
}

/**
 * Returns the property id for the current request — server-derived, never
 * client-provided.
 *
 * Resolution order (all server-derived):
 *  1. `req.property.id` — set by `resolveProperty` middleware (Phase 7)
 *  2. `req.user.propertyId` — set by `requireAuth` from JWT + DB
 *  3. `req.admin.propertyId` — legacy alias kept for Fase 0–4 compat
 *  4. Fallback to `getDefaultPropertyId()` for unauthenticated / legacy paths
 *
 * Never reads `propertyId` from `req.body` / `req.query` / `req.params`.
 *
 * ## Migration path for Fase 0–4 modules
 *   swap `getDefaultPropertyId()` → `getRequestPropertyId(req)` — no schema change
 *   needed since every Fase 0–4 model already carries `propertyId`.
 *
 * @example
 * ```ts
 * // Phase 8+ service (property-scoped):
 * export async function listTemplates(req: Request) {
 *   const propertyId = getRequestPropertyId(req)
 *   return prisma.messageTemplate.findMany({ where: { propertyId } })
 * }
 * ```
 */
export function getRequestPropertyId(req: Request): string {
  const fromReq =
    req.property?.id ?? req.user?.propertyId ?? req.admin?.propertyId ?? null

  if (fromReq) return fromReq
  return getDefaultPropertyId()
}
