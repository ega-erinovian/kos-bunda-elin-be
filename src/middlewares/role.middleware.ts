import { Request, Response, NextFunction } from 'express'

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }

    next()
  }
}
