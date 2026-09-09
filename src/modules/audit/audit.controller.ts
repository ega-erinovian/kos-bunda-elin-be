import { Request, Response, NextFunction } from 'express'
import * as service from './audit.service.js'
import { mapAuditLog } from './audit.mapper.js'
import type { AuditLogListQuery } from './audit.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as AuditLogListQuery
    const data = await service.listAuditLogs({
      propertyId: query.propertyId,
      entity: query.entity,
      entityId: query.entityId,
      from: query.from,
      to: query.to,
    })
    return res.json({ success: true, data: data.map(mapAuditLog) })
  } catch (err) { next(err) }
}
