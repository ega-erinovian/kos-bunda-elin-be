import type { Request, Response, NextFunction } from 'express'

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role ?? req.admin?.role

    if (!role) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    if (!roles.includes(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' })
      return
    }

    next()
  }
}
