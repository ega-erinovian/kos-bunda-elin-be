import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './expense.service.js'
import { mapFinancialTransaction } from '../financial-transaction/financial-transaction.mapper.js'
import type { ListExpenseQuery } from './expense.schema.js'

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const trx = await service.createExpense(propertyId, req.user?.id, req.body)
    return res.status(201).json({ success: true, data: mapFinancialTransaction(trx) })
  } catch (err) {
    next(err)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as unknown as ListExpenseQuery
    const result = await service.listExpenses(propertyId, query)
    return res.json({ success: true, data: result.data.map(mapFinancialTransaction), pagination: result.pagination })
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const trx = await service.updateExpense(propertyId, req.params.id as string, req.user?.id, req.body)
    return res.json({ success: true, data: mapFinancialTransaction(trx) })
  } catch (err) {
    next(err)
  }
}

export async function reverse(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const reversal = await service.reverseExpense(propertyId, req.params.id as string, req.user?.id, req.body.reason)
    return res.status(201).json({ success: true, data: { reversal: mapFinancialTransaction(reversal) } })
  } catch (err) {
    next(err)
  }
}
