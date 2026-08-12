import { Request, Response, NextFunction } from 'express'
import { apiSuccess, apiPagination } from '../../utils/apiResponse.js'
import * as pembayaranService from './pembayaran.service.js'
import type { PembayaranListQuery } from './pembayaran.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as PembayaranListQuery
    const result = await pembayaranService.getPembayaranList(query)
    return apiPagination(res, result.data, {
      page: query.page,
      limit: query.limit,
      total: result.total,
    })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const pembayaran = await pembayaranService.getPembayaranById(req.params.id as string)
    return apiSuccess(res, pembayaran)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const pembayaran = await pembayaranService.createPembayaran(req.body)
    return apiSuccess(res, pembayaran, 201)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const pembayaran = await pembayaranService.updatePembayaran(
      req.params.id as string,
      req.body,
    )
    return apiSuccess(res, pembayaran)
  } catch (err) {
    next(err)
  }
}