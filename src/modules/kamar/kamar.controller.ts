import { Request, Response, NextFunction } from 'express'
import { apiSuccess, apiPagination } from '../../utils/apiResponse.js'
import * as kamarService from './kamar.service.js'
import type { KamarListQuery } from './kamar.schema.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as KamarListQuery
    const result = await kamarService.getKamarList(query)
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
    const kamar = await kamarService.getKamarById(req.params.id as string)
    return apiSuccess(res, kamar)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const kamar = await kamarService.createKamar(req.body)
    return apiSuccess(res, kamar, 201)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const kamar = await kamarService.updateKamar(req.params.id as string, req.body)
    return apiSuccess(res, kamar)
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const kamar = await kamarService.deleteKamar(req.params.id as string)
    return apiSuccess(res, kamar)
  } catch (err) {
    next(err)
  }
}