import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import logger from '../../config/logger.js'
import { env } from '../../config/env.js'
import { NotificationStatus } from '@prisma/client'
import { updateStatusFromWebhook } from './notification.service.js'

// ---------------------------------------------------------------------------
// Helpers: HMAC
// ---------------------------------------------------------------------------

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

function verifyHmacSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader) return false
  // Header format: "sha256=<hex>"
  const prefix = 'sha256='
  const receivedHex = signatureHeader.startsWith(prefix) ? signatureHeader.slice(prefix.length) : signatureHeader
  const expectedHex = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return timingSafeEqualHex(expectedHex, receivedHex)
}

// ---------------------------------------------------------------------------
// GET — Meta verification handshake
// ---------------------------------------------------------------------------

export async function verifyWebhook(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'] as string | undefined
  const token = req.query['hub.verify_token'] as string | undefined
  const challenge = req.query['hub.challenge'] as string | undefined

  const verifyToken = (env as any).WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('WhatsApp webhook verified')
    res.status(200).send(challenge ?? '')
    return
  }

  // Also support Evolution-style GET ping without verification (just ack)
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  if (provider === 'evolution' || provider === 'mock') {
    if (challenge) {
      res.status(200).send(challenge)
      return
    }
    res.status(200).json({ status: 'ok', provider })
    return
  }

  logger.warn({ mode, token }, 'WhatsApp webhook verification failed')
  res.status(403).send('Verification failed')
}

// ---------------------------------------------------------------------------
// Status extraction — Meta Cloud API shape
// ---------------------------------------------------------------------------

function mapMetaStatus(raw: string): NotificationStatus | null {
  const s = raw.toLowerCase()
  if (s === 'sent') return NotificationStatus.SENT
  if (s === 'delivered') return NotificationStatus.DELIVERED
  if (s === 'read') return NotificationStatus.READ
  if (s === 'failed') return NotificationStatus.FAILED
  return null
}

function extractMetaStatuses(body: any): Array<{ providerMessageId: string; status: NotificationStatus; timestamp?: Date; failureReason?: string }> {
  const out: Array<{ providerMessageId: string; status: NotificationStatus; timestamp?: Date; failureReason?: string }> = []
  if (!body || typeof body !== 'object') return out
  const entries = Array.isArray(body.entry) ? body.entry : []
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value
      if (!value || typeof value !== 'object') continue
      const statuses = Array.isArray(value.statuses) ? value.statuses : []
      for (const st of statuses) {
        const rawId = typeof st?.id === 'string' ? st.id : null
        const rawStatus = typeof st?.status === 'string' ? st.status : null
        if (!rawId || !rawStatus) continue
        const mapped = mapMetaStatus(rawStatus)
        if (!mapped) continue
        let ts: Date | undefined
        if (st.timestamp) {
          const sec = Number(st.timestamp)
          if (!Number.isNaN(sec)) ts = new Date(sec * 1000)
        }
        let failureReason: string | undefined
        if (mapped === NotificationStatus.FAILED) {
          const err = Array.isArray(st.errors) && st.errors.length ? st.errors[0] : null
          if (err) {
            const title = err.title || err.code || 'failed'
            const msg = err.message || err.details || ''
            failureReason = `${title}: ${msg}`.slice(0, 500)
            // Heuristic: Meta failed errors with codes 131026 etc are permanent; keep as [permanent] so retry skips
            failureReason = `[permanent] ${failureReason}`
          } else {
            failureReason = '[permanent] Meta reported failed without details'
          }
        }
        out.push({ providerMessageId: rawId, status: mapped, timestamp: ts, failureReason })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Status extraction — Evolution API shape (generic walk)
// ---------------------------------------------------------------------------

function mapEvolutionStatus(raw: string): NotificationStatus | null {
  const s = String(raw).toUpperCase()
  if (s === 'SENT' || s === 'PENDING' || s === 'SERVER_ACK') return NotificationStatus.SENT
  if (s === 'DELIVERED' || s === 'DELIVERY_ACK') return NotificationStatus.DELIVERED
  if (s === 'READ' || s === 'PLAYED') return NotificationStatus.READ
  if (s === 'FAILED' || s === 'ERROR' || s === 'FAILURE') return NotificationStatus.FAILED
  // lower case fallback
  return mapMetaStatus(s.toLowerCase())
}

function extractEvolutionStatuses(body: any): Array<{ providerMessageId: string; status: NotificationStatus; timestamp?: Date; failureReason?: string }> {
  const out: Array<{ providerMessageId: string; status: NotificationStatus; timestamp?: Date; failureReason?: string }> = []
  if (!body || typeof body !== 'object') return out

  // Common envelope: { event, data: { key:{id}, status, ... } }
  const candidates: any[] = []

  // Direct data
  if (body.data && typeof body.data === 'object') candidates.push(body.data)
  if (Array.isArray(body.data)) candidates.push(...body.data)
  // Bare body is candidate
  candidates.push(body)
  // If body has .instance / .event wrapping, also check body.data array etc.

  // Also walk one level deep for nested structures like { data: { key, status } }
  const toCheck: any[] = [...candidates]
  if (body.data?.key && typeof body.data.key === 'object') toCheck.push(body.data)
  if (body.key && typeof body.key === 'object') toCheck.push(body)

  for (const cand of toCheck) {
    if (!cand || typeof cand !== 'object') continue
    let id: string | null = null
    let statusRaw: string | null = null

    // shapes: cand.key.id  | cand.keyId | cand.id | cand.messageId
    if (cand.key && typeof cand.key.id === 'string') id = cand.key.id
    else if (typeof cand.keyId === 'string') id = cand.keyId
    else if (typeof cand.id === 'string') id = cand.id
    else if (typeof cand.messageId === 'string') id = cand.messageId
    else if (cand.key && typeof cand.key.Id === 'string') id = cand.key.Id

    if (typeof cand.status === 'string') statusRaw = cand.status
    else if (typeof cand.update === 'string') statusRaw = cand.update

    if (!id || !statusRaw) continue
    const mapped = mapEvolutionStatus(statusRaw)
    if (!mapped) continue

    let ts: Date | undefined
    const tsCandidate = cand.messageTimestamp ?? cand.timestamp ?? cand.datetime ?? cand.date_time
    if (tsCandidate != null) {
      const n = Number(tsCandidate)
      if (!Number.isNaN(n)) {
        ts = n > 1e12 ? new Date(n) : new Date(n * 1000)
      } else {
        const d = new Date(String(tsCandidate))
        if (!Number.isNaN(d.getTime())) ts = d
      }
    }

    let failureReason: string | undefined
    if (mapped === NotificationStatus.FAILED) {
      failureReason = typeof cand.reason === 'string' ? `[permanent] ${cand.reason}` : '[permanent] Evolution reported failed'
    }

    out.push({ providerMessageId: id, status: mapped, timestamp: ts, failureReason })
  }

  // Deduplicate by providerMessageId+status
  const seen = new Set<string>()
  return out.filter((e) => {
    const k = `${e.providerMessageId}:${e.status}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Combine
function extractAllStatuses(body: any) {
  const meta = extractMetaStatuses(body)
  if (meta.length) return meta
  return extractEvolutionStatuses(body)
}

// ---------------------------------------------------------------------------
// POST — status callbacks (+ inbound ignored with 200)
// ---------------------------------------------------------------------------

const webhookPayloadSchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(z.any()).optional(),
    event: z.string().optional(),
    instance: z.string().optional(),
    data: z.any().optional(),
  })
  .passthrough()

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  const appSecret = (env as any).WHATSAPP_APP_SECRET as string | undefined

  // HMAC check — only enforced for cloud provider when secret is set
  if (provider === 'cloud' && appSecret) {
    const rawBody = (req as any).rawBody as string | undefined
    const sig = req.header('x-hub-signature-256') || req.header('X-Hub-Signature-256')
    const bodyForHmac = rawBody ?? JSON.stringify(req.body)
    if (!verifyHmacSignature(bodyForHmac, sig, appSecret)) {
      logger.warn('WhatsApp webhook HMAC verification failed')
      res.status(401).json({ success: false, message: 'Invalid signature' })
      return
    }
  } else if (appSecret && provider === 'cloud') {
    // cloud but no header -> already handled above as failure
  } else {
    // evolution/mock: optional HMAC — if secret set and header present, verify; otherwise skip
    const rawBody = (req as any).rawBody as string | undefined
    const sig = req.header('x-hub-signature-256') || req.header('X-Hub-Signature-256')
    if (appSecret && sig) {
      const bodyForHmac = rawBody ?? JSON.stringify(req.body)
      if (!verifyHmacSignature(bodyForHmac, sig, appSecret)) {
        logger.warn('Webhook HMAC failed (evolution/mock) — rejecting')
        res.status(401).json({ success: false, message: 'Invalid signature' })
        return
      }
    }
  }

  const parsed = webhookPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten(), body: req.body }, 'Webhook payload shape mismatch — ack 200 to stop retries')
    res.status(200).json({ success: true, warning: 'shape mismatch, acked' })
    return
  }

  const statuses = extractAllStatuses(req.body)

  if (statuses.length === 0) {
    // No status events (e.g. inbound message or unknown shape) — still ack 200 so sender doesn't retry
    logger.info({ body: req.body }, 'Webhook received with no status events — ack 200')
    res.status(200).json({ success: true, received: 0 })
    return
  }

  let updated = 0
  for (const ev of statuses) {
    try {
      const result = await updateStatusFromWebhook(ev.providerMessageId, {
        status: ev.status,
        timestamp: ev.timestamp,
        failureReason: ev.failureReason,
      })
      if (result) updated++
    } catch (err) {
      logger.error({ err, ev }, 'Failed to update status from webhook')
    }
  }

  logger.info({ total: statuses.length, updated }, 'Webhook statuses processed')
  res.status(200).json({ success: true, received: statuses.length, updated })
}

// For tests
export const _internal = {
  verifyHmacSignature,
  mapMetaStatus,
  extractMetaStatuses,
  mapEvolutionStatus,
  extractEvolutionStatuses,
  extractAllStatuses,
}
