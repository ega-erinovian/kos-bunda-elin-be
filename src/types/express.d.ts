/**
 * Central Express request augmentation for authentication & multi-property context (Phase 7).
 *
 * - `req.user` and `req.admin` are kept in sync (same principal) for backwards compatibility.
 *   New code should prefer `req.user`; `req.admin` remains for Fase 0–4 compatibility.
 * - `req.property` is set by `resolveProperty` middleware from server-derived `req.user.propertyId`.
 *   Never trust `propertyId` from body / query / params.
 */

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
        propertyId: string
        email?: string
        nama?: string
      }

      admin?: {
        id: string
        email: string
        nama: string
        role: string
        propertyId: string
      }

      property?: {
        id: string
      }

      rawBody?: string
    }
  }
}

export {}
