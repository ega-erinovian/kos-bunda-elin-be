import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import prisma from '../config/prisma.js'

export interface JwtPayload {
  adminId: string
  role: string
  propertyId?: string
}

/**
 * Extracts bearer token from `Authorization: Bearer <token>` if present.
 */
function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

/**
 * Authentication guard.
 *
 * - Accepts token from httpOnly cookie (`access_token`) **or** `Authorization: Bearer` header.
 *   Cookie is primary (browser flow); Bearer is supported for tests, mobile clients, and future non-browser consumers.
 * - Verifies JWT, then re-fetches admin from DB to ensure the admin still exists and to obtain the
 *   authoritative `propertyId` (never fully trust the claim — DB wins if they differ).
 *
 * Does **not** set `req.property` — use `resolveProperty` (property.middleware.ts) for that.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.[env.ACCESS_COOKIE_NAME] as string | undefined
    const bearerToken = extractBearerToken(req.headers.authorization)
    const token = cookieToken ?? bearerToken

    if (!token) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtPayload

    if (!decoded?.adminId) {
      res.status(401).json({ success: false, message: 'Invalid token' })
      return
    }

    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, email: true, nama: true, role: true, propertyId: true },
    })

    if (!admin) {
      res.status(401).json({ success: false, message: 'Admin not found' })
      return
    }

    const principal = {
      id: admin.id,
      email: admin.email,
      nama: admin.nama,
      role: admin.role,
      propertyId: admin.propertyId,
    }

    req.admin = principal
    req.user = {
      id: principal.id,
      role: principal.role,
      propertyId: principal.propertyId,
      email: principal.email,
      nama: principal.nama,
    }

    next()
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' })
  }
}
