import { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './financial-transaction.service.js'
import { mapFinancialTransaction } from './financial-transaction.mapper.js'
import type { FinancialTransactionListQuery } from './financial-transaction.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as unknown as FinancialTransactionListQuery
    const result = await service.listTransactions(propertyId, query)
    return res.json({ success: true, data: result.data.map(mapFinancialTransaction), pagination: result.pagination })
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const trx = await service.createTransaction(propertyId, req.user?.id, req.body)
    return res.status(201).json({ success: true, data: mapFinancialTransaction(trx) })
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const trx = await service.updateTransaction(propertyId, req.params.id as string, req.user?.id, req.body)
    return res.json({ success: true, data: mapFinancialTransaction(trx) })
  } catch (err) { next(err) }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    await service.softDeleteTransaction(propertyId, req.params.id as string, req.user?.id)
    return res.status(204).send()
  } catch (err) { next(err) }
}
