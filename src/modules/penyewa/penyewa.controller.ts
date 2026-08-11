import { Request, Response, NextFunction } from 'express'
import { apiSuccess, apiPagination } from '../../utils/apiResponse.js'
import * as penyewaService from './penyewa.service.js'
import type { PenyewaListQuery } from './penyewa.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as PenyewaListQuery
    const result = await penyewaService.getPenyewaList(query)
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
    const penyewa = await penyewaService.getPenyewaById(req.params.id as string)
    return apiSuccess(res, penyewa)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const penyewa = await penyewaService.createPenyewa(req.body)
    return apiSuccess(res, penyewa, 201)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const penyewa = await penyewaService.updatePenyewa(req.params.id as string, req.body)
    return apiSuccess(res, penyewa)
  } catch (err) {
    next(err)
  }
}

export async function keluar(req: Request, res: Response, next: NextFunction) {
  try {
    const penyewa = await penyewaService.keluarPenyewa(req.params.id as string, req.body)
    return apiSuccess(res, penyewa)
  } catch (err) {
    next(err)
  }
}