import type { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './finance-report.service.js'
import * as receivableService from '../receivable/receivable.service.js'
import { mapFinancialTransaction } from '../financial-transaction/financial-transaction.mapper.js'

function resolveAsOf(req: Request): Date {
  const raw = (req.query as any)?.asOf as Date | string | undefined
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw
  if (typeof raw === 'string') {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export async function dashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getDashboardReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function transactions(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const result = await service.getTransactionsReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
      type: query.type as 'INCOME' | 'EXPENSE' | undefined,
      categoryId: query.categoryId as string | undefined,
    })
    return res.json({ success: true, data: result.data.map(mapFinancialTransaction) })
  } catch (err) {
    next(err)
  }
}

export async function revenue(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getRevenueReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function expenses(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getExpenseReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function cashFlow(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getCashFlowReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function incomeStatement(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as any
    const data = await service.getIncomeStatementReport(propertyId, {
      from: query.from as Date | undefined,
      to: query.to as Date | undefined,
    })
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function receivables(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const asOf = resolveAsOf(req)
    const data = await receivableService.getReceivables(propertyId, asOf)
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function receivablesAging(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const asOf = resolveAsOf(req)
    const data = await receivableService.getAging(propertyId, asOf)
    return res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
