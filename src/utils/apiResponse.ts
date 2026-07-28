import { Response } from 'express'

export function apiSuccess(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data })
}

export function apiPagination(
  res: Response,
  data: unknown[],
  meta: { page: number; limit: number; total: number },
) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: Math.ceil(meta.total / meta.limit),
    },
  })
}

export function apiError(res: Response, message: string, status = 400) {
  return res.status(status).json({ success: false, message })
}
