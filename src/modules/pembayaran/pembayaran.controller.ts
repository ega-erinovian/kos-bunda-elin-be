import { Request, Response, NextFunction } from 'express'
import { apiSuccess, apiPagination } from '../../utils/apiResponse.js'
import * as pembayaranService from './pembayaran.service.js'
import type { PembayaranListQuery } from './pembayaran.schema.js'
import {
  mapPembayaranList,
  mapPembayaranDetail,
  mapPaymentRecord,
  mapAddPaymentRecordResponse,
} from './pembayaran.mapper.js'

interface AuthRequest extends Request {
  user?: {
    id: string
    role: string
    propertyId?: string
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as PembayaranListQuery
    const result = await pembayaranService.getPembayaranList(query)
    const mapped = result.data.map(mapPembayaranList)
    return apiPagination(res, mapped, {
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
    // Map detail response WITH paymentRecords (§1 item 4)
    const mapped = mapPembayaranDetail(pembayaran)
    return apiSuccess(res, mapped)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const pembayaran = await pembayaranService.createPembayaran(req.body)
    const mapped = mapPembayaranList(pembayaran)
    return apiSuccess(res, mapped, 201)
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
    const mapped = mapPembayaranList(pembayaran)
    return apiSuccess(res, mapped)
  } catch (err) {
    next(err)
  }
}

export async function markLunas(req: Request, res: Response, next: NextFunction) {
  try {
    const pembayaran = await pembayaranService.markPembayaranLunas(req.params.id as string)
    const mapped = mapPembayaranList(pembayaran)
    return apiSuccess(res, mapped)
  } catch (err) {
    next(err)
  }
}

export async function addPayment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Extract Idempotency-Key header (required per §1 item 6)
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    
    const result = await pembayaranService.addPaymentRecord(
      req.params.id as string,
      req.body,
      req.user?.id,
      idempotencyKey
    )
    
    // Map response with Decimal → number conversion
    const mapped = mapAddPaymentRecordResponse(result)
    
    // Return 200 for idempotent replay, 201 for new record
    const statusCode = result.isReplay ? 200 : 201
    return apiSuccess(res, mapped, statusCode)
  } catch (err) {
    next(err)
  }
}

export async function getPaymentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await pembayaranService.getPaymentHistory(req.params.id as string)
    const mapped = { data: history.map(mapPaymentRecord) }
    return apiSuccess(res, mapped)
  } catch (err) {
    next(err)
  }
}
