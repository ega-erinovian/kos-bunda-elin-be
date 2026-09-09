import { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './financial-account.service.js'
import { mapFinancialAccount } from './financial-account.mapper.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const data = await service.listAccounts(propertyId)
    return res.json({ success: true, data: data.map(mapFinancialAccount) })
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const account = await service.createAccount(propertyId, req.body)
    return res.status(201).json({ success: true, data: mapFinancialAccount(account) })
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const account = await service.updateAccount(propertyId, req.params.id as string, req.body)
    return res.json({ success: true, data: mapFinancialAccount(account) })
  } catch (err) { next(err) }
}
