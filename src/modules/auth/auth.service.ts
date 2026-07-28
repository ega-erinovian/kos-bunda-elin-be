import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import prisma from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/apiError.js'
import type { LoginInput } from './auth.schema.js'

function generateAccessToken(admin: { id: string; role: string; propertyId: string }) {
  return jwt.sign(
    { adminId: admin.id, role: admin.role, propertyId: admin.propertyId },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}` },
  )
}

function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) return 30 * 24 * 60 * 60 * 1000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }
  return value * (multipliers[unit] || 24 * 60 * 60 * 1000)
}

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
}

export async function login(input: LoginInput) {
  const admin = await prisma.admin.findUnique({ where: { email: input.email } })
  if (!admin) {
    throw new AppError('Invalid email or password', 401)
  }

  const valid = await bcrypt.compare(input.password, admin.passwordHash)
  if (!valid) {
    throw new AppError('Invalid email or password', 401)
  }

  const accessToken = generateAccessToken(admin)
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken()
  const expiresAt = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN))

  await prisma.refreshToken.create({
    data: {
      adminId: admin.id,
      tokenHash: refreshHash,
      expiresAt,
    },
  })

  return {
    accessToken,
    refreshToken: refreshRaw,
    refreshExpiresAt: expiresAt,
    admin: { id: admin.id, nama: admin.nama, email: admin.email, role: admin.role },
  }
}

export async function refresh(refreshTokenCookie: string) {
  const hash = hashRefreshToken(refreshTokenCookie)

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  const admin = await prisma.admin.findUnique({
    where: { id: stored.adminId },
    select: { id: true, nama: true, email: true, role: true, propertyId: true },
  })
  if (!admin) {
    throw new AppError('Admin not found', 401)
  }

  const accessToken = generateAccessToken(admin)
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken()
  const expiresAt = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN))

  await prisma.refreshToken.create({
    data: {
      adminId: admin.id,
      tokenHash: refreshHash,
      expiresAt,
    },
  })

  return {
    accessToken,
    refreshToken: refreshRaw,
    refreshExpiresAt: expiresAt,
    admin: { id: admin.id, nama: admin.nama, email: admin.email, role: admin.role },
  }
}

export async function logout(refreshTokenCookie: string | undefined) {
  if (!refreshTokenCookie) return

  const hash = hashRefreshToken(refreshTokenCookie)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } })
  if (stored && !stored.revokedAt) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })
  }
}

export async function getMe(adminId: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, nama: true, email: true, role: true, propertyId: true },
  })
  if (!admin) {
    throw new AppError('Admin not found', 404)
  }
  return admin
}

export { cookieOptions }
