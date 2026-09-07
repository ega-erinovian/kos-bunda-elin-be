import { env } from '../../config/env.js'
import logger from '../../config/logger.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppTextMessageRequest {
  to: string
  body: string
  previewUrl?: boolean
}

export interface WhatsAppTemplateRequest {
  to: string
  templateName: string
  languageCode?: string
  variables?: string[]
}

export interface WhatsAppSendSuccess {
  messaging_product: 'whatsapp'
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

export class WhatsAppApiError extends Error {
  public readonly statusCode: number
  public readonly body: unknown
  public readonly isRetryable: boolean

  constructor(message: string, statusCode: number, body: unknown, isRetryable: boolean) {
    super(message)
    this.statusCode = statusCode
    this.body = body
    this.isRetryable = isRetryable
    Object.setPrototypeOf(this, WhatsAppApiError.prototype)
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export function isWhatsAppConfigured(): boolean {
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  if (provider === 'mock') return true
  if (provider === 'evolution') return isEvolutionConfigured()
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID)
}

export function isEvolutionConfigured(): boolean {
  return Boolean((env as any).EVOLUTION_API_URL && (env as any).EVOLUTION_API_KEY && (env as any).EVOLUTION_INSTANCE_NAME)
}

function getBaseUrl(): string {
  const version = env.WHATSAPP_API_VERSION || 'v20.0'
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
}

function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export function getEvolutionUrl(): string {
  const base = String((env as any).EVOLUTION_API_URL || '').replace(/\/+$/, '')
  const instance = String((env as any).EVOLUTION_INSTANCE_NAME || '')
  return `${base}/message/sendText/${instance}`
}

function getEvolutionHeaders(): Record<string, string> {
  return {
    apikey: String((env as any).EVOLUTION_API_KEY || ''),
    'Content-Type': 'application/json',
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

function mockSuccess(to: string): WhatsAppSendSuccess {
  const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    messaging_product: 'whatsapp',
    contacts: [{ input: to, wa_id: to }],
    messages: [{ id }],
  }
}

// ---------------------------------------------------------------------------
// Internal fetch
// ---------------------------------------------------------------------------

async function whatsAppFetch(payload: Record<string, unknown>): Promise<WhatsAppSendSuccess> {
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  if (provider === 'mock') {
    // used only via direct mock branch below, but keep guard
    throw new WhatsAppApiError('mock provider should not call whatsAppFetch', 0, null, false)
  }
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppApiError(
      'WhatsApp Cloud API is not configured (missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)',
      0,
      null,
      false,
    )
  }

  const url = getBaseUrl()

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    })
  } catch (err: any) {
    throw new WhatsAppApiError(
      `WhatsApp fetch network error: ${err?.message || 'unknown'}`,
      0,
      null,
      true,
    )
  }

  const rawBody = await response.text()
  let body: unknown
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    body = rawBody
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? JSON.stringify((body as any).error)
        : `WhatsApp API error ${response.status}: ${rawBody.slice(0, 500)}`

    throw new WhatsAppApiError(message, response.status, body, isRetryableStatus(response.status))
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('messages' in body) ||
    !Array.isArray((body as any).messages) ||
    (body as any).messages.length === 0 ||
    typeof (body as any).messages[0]?.id !== 'string'
  ) {
    logger.warn({ body }, 'WhatsApp API returned unexpected success shape')
    throw new WhatsAppApiError('Malformed WhatsApp success response', response.status, body, false)
  }

  return body as WhatsAppSendSuccess
}

async function evolutionFetch(to: string, text: string): Promise<WhatsAppSendSuccess> {
  if (!isEvolutionConfigured()) {
    throw new WhatsAppApiError(
      'Evolution API not configured (missing EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME)',
      0,
      null,
      false,
    )
  }
  const url = getEvolutionUrl()
  // Evolution v2.1 expects { number, text }, v2.3 expects { number, textMessage:{text} } — send both for compat
  const payload: Record<string, unknown> = {
    number: to,
    text,
    textMessage: { text },
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: getEvolutionHeaders(),
      body: JSON.stringify(payload),
    })
  } catch (err: any) {
    throw new WhatsAppApiError(`Evolution fetch network error: ${err?.message || 'unknown'}`, 0, null, true)
  }
  const rawBody = await response.text()
  let body: unknown
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    body = rawBody
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? JSON.stringify((body as any).error)
        : `Evolution API error ${response.status}: ${rawBody.slice(0, 500)}`
    throw new WhatsAppApiError(message, response.status, body, isRetryableStatus(response.status))
  }
  // Evolution success: { key: { id, remoteJid }, ... }  (201) or { key:{id}} (200)
  const id =
    (body as any)?.key?.id ||
    (body as any)?.key?.Id ||
    (body as any)?.messages?.[0]?.id ||
    (body as any)?.id
  if (typeof id === 'string' && id) {
    return {
      messaging_product: 'whatsapp',
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id }],
    }
  }
  logger.warn({ body }, 'Evolution API returned unexpected success shape')
  throw new WhatsAppApiError('Malformed Evolution success response', response.status, body, false)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends a free-form text message via Cloud API or Evolution API (branch by WHATSAPP_PROVIDER).
 * `mock` provider returns a fake id without network — used in CI/dev when no credentials.
 */
export async function sendWhatsAppTextMessage(
  request: WhatsAppTextMessageRequest,
): Promise<WhatsAppSendSuccess> {
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  if (provider === 'mock') return mockSuccess(request.to)
  if (provider === 'evolution') return evolutionFetch(request.to, request.body)

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: 'text',
    text: {
      preview_url: request.previewUrl ?? false,
      body: request.body,
    },
  }

  return whatsAppFetch(payload)
}

/**
 * Sends an approved template message.
 * Preferred outside the 24h window for deliverability.
 * For Evolution provider templates are not required — we render as plain text.
 */
export async function sendWhatsAppTemplateMessage(
  request: WhatsAppTemplateRequest,
): Promise<WhatsAppSendSuccess> {
  const provider = (env as any).WHATSAPP_PROVIDER || 'cloud'
  if (provider === 'mock') return mockSuccess(request.to)
  if (provider === 'evolution') {
    const text = request.variables?.length
      ? `${request.templateName}: ${request.variables.join(' | ')}`
      : request.templateName
    return evolutionFetch(request.to, text)
  }

  const languageCode = request.languageCode ?? 'id'

  const components =
    request.variables && request.variables.length > 0
      ? [
          {
            type: 'body' as const,
            parameters: request.variables.map((v) => ({ type: 'text' as const, text: String(v) })),
          },
        ]
      : undefined

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: 'template',
    template: {
      name: request.templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  }

  return whatsAppFetch(payload)
}

/**
 * Exposed for testing — allows injecting a custom fetch without mocking global.
 * Prefer mocking global fetch in unit tests; this helper is deliberately not
 * used in production code to keep the client thin.
 */
export const _internal = {
  getBaseUrl,
  getAuthHeaders,
  getEvolutionUrl,
  getEvolutionHeaders,
  isRetryableStatus,
  isEvolutionConfigured,
}
