import { Request, Response, NextFunction } from 'express'
import * as pushService from './push.service.js'
import { apiSuccess } from '../../utils/apiResponse.js'

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pushService.subscribe(req.body)
    return apiSuccess(res, result, 201)
  } catch (err) {
    next(err)
  }
}

export async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pushService.unsubscribe(req.body.endpoint)
    return apiSuccess(res, result)
  } catch (err) {
    next(err)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await pushService.listByPenyewa(req.params.penyewaId as string)
    return apiSuccess(res, { data })
  } catch (err) {
    next(err)
  }
}
