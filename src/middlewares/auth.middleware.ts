import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import prisma from '../config/prisma.js'

export interface JwtPayload {
  adminId: string
  role: string
  propertyId: string
}

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string
        email: string
        nama: string
        role: string
        propertyId: string
      }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.ACCESS_COOKIE_NAME]

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtPayload

    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, email: true, nama: true, role: true, propertyId: true },
    })

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin not found' })
    }

    req.admin = admin
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
}
