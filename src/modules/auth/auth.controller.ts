import { Request, Response, NextFunction } from 'express'
import { env } from '../../config/env.js'
import * as authService from './auth.service.js'

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
) {
  const accessMaxAge = parseMaxAge(env.ACCESS_TOKEN_EXPIRES_IN)
  const refreshMaxAge = refreshExpiresAt.getTime() - Date.now()

  res.cookie(env.ACCESS_COOKIE_NAME, accessToken, {
    ...authService.cookieOptions,
    maxAge: accessMaxAge,
  })
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    ...authService.cookieOptions,
    maxAge: refreshMaxAge,
    path: '/api/auth',
  })
}

function clearAuthCookies(res: Response) {
  res.clearCookie(env.ACCESS_COOKIE_NAME, { path: '/' })
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: '/api/auth' })
}

function parseMaxAge(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) return 15 * 60 * 1000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }
  return value * (multipliers[unit] || 15 * 60 * 1000)
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body)
    setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshExpiresAt)
    res.json({ success: true, data: { admin: result.admin } })
  } catch (err) {
    next(err)
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshTokenCookie = req.cookies?.[env.REFRESH_COOKIE_NAME]
    if (!refreshTokenCookie) {
      return res.status(401).json({ success: false, message: 'Refresh token missing' })
    }

    const result = await authService.refresh(refreshTokenCookie)
    setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshExpiresAt)
    res.json({ success: true, data: { admin: result.admin } })
  } catch (err) {
    next(err)
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshTokenCookie = req.cookies?.[env.REFRESH_COOKIE_NAME]
    await authService.logout(refreshTokenCookie)
    clearAuthCookies(res)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await authService.getMe(req.admin!.id)
    res.json({ success: true, data: admin })
  } catch (err) {
    next(err)
  }
}
