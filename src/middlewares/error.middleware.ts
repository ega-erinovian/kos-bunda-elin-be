import { Request, Response, NextFunction } from 'express'
import logger from '../config/logger.js'
import { AppError } from '../utils/apiError.js'

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    })
  }

  logger.error(err)

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  })
}
