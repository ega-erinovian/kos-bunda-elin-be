import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './deposit.service.js'
import { mapDeposit } from './deposit.mapper.js'
import type { ListDepositQuery } from './deposit.schema.js'

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const deposit = await service.receiveDeposit(propertyId, req.user?.id, req.body)
    return res.status(201).json({ success: true, data: mapDeposit(deposit) })
  } catch (err) {
    next(err)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as unknown as ListDepositQuery
    const result = await service.listDeposits(propertyId, query)
    return res.json({ success: true, data: result.data.map(mapDeposit) })
  } catch (err) {
    next(err)
  }
}

export async function deduct(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const deposit = await service.deductDeposit(propertyId, req.params.id as string, req.user?.id, req.body)
    return res.json({ success: true, data: mapDeposit(deposit) })
  } catch (err) {
    next(err)
  }
}

export async function refund(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const deposit = await service.refundDeposit(propertyId, req.params.id as string, req.user?.id, req.body)
    return res.json({ success: true, data: mapDeposit(deposit) })
  } catch (err) {
    next(err)
  }
}
