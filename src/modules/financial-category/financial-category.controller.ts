import { Request, Response, NextFunction } from 'express'
import { getRequestPropertyId } from '../../config/property.js'
import * as service from './financial-category.service.js'
import { mapFinancialCategory } from './financial-category.mapper.js'
import type { FinancialCategoryListQuery } from './financial-category.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const query = req.query as unknown as FinancialCategoryListQuery
    const data = await service.listCategories(propertyId, query.type)
    return res.json({ success: true, data: data.map(mapFinancialCategory) })
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const cat = await service.createCategory(propertyId, req.body)
    return res.status(201).json({ success: true, data: mapFinancialCategory(cat) })
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const propertyId = getRequestPropertyId(req)
    const cat = await service.updateCategory(propertyId, req.params.id as string, req.body)
    return res.json({ success: true, data: mapFinancialCategory(cat) })
  } catch (err) { next(err) }
}
