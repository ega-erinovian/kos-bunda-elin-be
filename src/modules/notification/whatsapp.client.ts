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
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID)
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

// ---------------------------------------------------------------------------
// Internal fetch
// ---------------------------------------------------------------------------

async function whatsAppFetch(payload: Record<string, unknown>): Promise<WhatsAppSendSuccess> {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends a free-form text message via Cloud API.
 * Used within the 24h session window or when template is not required.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
export async function sendWhatsAppTextMessage(
  request: WhatsAppTextMessageRequest,
): Promise<WhatsAppSendSuccess> {
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
 */
export async function sendWhatsAppTemplateMessage(
  request: WhatsAppTemplateRequest,
): Promise<WhatsAppSendSuccess> {
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
  isRetryableStatus,
}
