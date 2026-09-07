import logger from '../../../config/logger.js'
import { NotificationStatus } from '@prisma/client'
import type { NotificationPayload, NotificationProvider, NotificationProviderResult } from '../notification.types.js'
import { env } from '../../../config/env.js'
import {
  isWhatsAppConfigured,
  sendWhatsAppTextMessage,
  sendWhatsAppTemplateMessage,
  WhatsAppApiError,
} from '../whatsapp.client.js'
import {
  buildTemplateVariables,
  getWhatsAppTemplateConfig,
  isTemplateRequiredError,
} from '../../message-template/whatsapp-template.util.js'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
//
// Penyewa.noHp is normalized to `62xxxxxxxxxx` per §11 decision 2.
// Cloud API expects E.164 without "+" — exactly that format.
//

const PHONE_62_REGEX = /^62\d{8,15}$/

function validateRecipient(to: string): string | null {
  if (!to) return 'Recipient phone is empty'
  if (!PHONE_62_REGEX.test(to)) {
    return `Recipient "${to}" does not match 62xxxxxxxxxx (8–15 digits after 62)`
  }
  return null
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof WhatsAppApiError) return err.isRetryable

  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('network') || msg.includes('timeout') || msg.includes('econn')
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const whatsAppProvider: NotificationProvider = {
  channel: 'WHATSAPP',

  async send(payload: NotificationPayload): Promise<NotificationProviderResult> {
    // 1. Guard — missing config must not crash the app (§5.19)
    if (!isWhatsAppConfigured()) {
      const prov = (env as any).WHATSAPP_PROVIDER || 'cloud'
      logger.warn({ provider: prov }, 'WhatsApp send skipped — provider not configured')
      const hint =
        prov === 'evolution'
          ? 'Evolution API not configured (set EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME)'
          : prov === 'mock'
            ? 'mock provider misconfigured (should never happen)'
            : 'WhatsApp Cloud API not configured (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)'
      return {
        status: NotificationStatus.FAILED,
        failureReason: hint,
      }
    }

    // 2. Validate recipient format early (permanent failure → do not retry)
    const phoneError = validateRecipient(payload.recipient)
    if (phoneError) {
      logger.warn({ recipient: payload.recipient }, `WhatsApp send skipped — ${phoneError}`)
      return {
        status: NotificationStatus.FAILED,
        failureReason: phoneError,
      }
    }

    // 3. Prefer free-form text (valid within 24h window)
    try {
      const result = await sendWhatsAppTextMessage({
        to: payload.recipient,
        body: payload.isiRingkas,
      })

      return {
        status: NotificationStatus.SENT,
        providerMessageId: result.messages[0].id,
      }
    } catch (err: unknown) {
      // 3a. If Meta signals "template required", fall back to template send
      if (err instanceof WhatsAppApiError && isTemplateRequiredError(err.body)) {
        const templateConfig = getWhatsAppTemplateConfig(payload.jenis as any)
        if (!templateConfig) {
          logger.warn({ jenis: payload.jenis, body: err.body }, 'WhatsApp text rejected — no template mapping available')
          return {
            status: NotificationStatus.FAILED,
            failureReason:
              `Template required outside 24h window but no mapping for jenis=${payload.jenis}: ${err.message}`,
          }
        }

        try {
          const variables = buildTemplateVariables(payload)
          const templateResult = await sendWhatsAppTemplateMessage({
            to: payload.recipient,
            templateName: templateConfig.name,
            languageCode: templateConfig.language,
            variables,
          })

          logger.info(
            { recipient: payload.recipient, template: templateConfig.name, id: templateResult.messages[0].id },
            'WhatsApp template fallback succeeded',
          )

          return {
            status: NotificationStatus.SENT,
            providerMessageId: templateResult.messages[0].id,
          }
        } catch (templateErr: unknown) {
          const message =
            templateErr instanceof WhatsAppApiError ? templateErr.message : (templateErr as Error)?.message || String(templateErr)

          logger.warn({ err: templateErr, recipient: payload.recipient }, 'WhatsApp template fallback failed')

          // Distinguish retryable (5xx/429) vs permanent (4xx — bad template, bad recipient)
          const retryable = isRetryableError(templateErr)
          return {
            status: NotificationStatus.FAILED,
            failureReason: `${retryable ? '[retryable] ' : '[permanent] '}Template fallback failed: ${message}`,
          }
        }
      }

      // Direct text failure (not template-required)
      const message = err instanceof Error ? err.message : String(err)
      const retryable = isRetryableError(err)

      logger.warn(
        { err, recipient: payload.recipient, retryable },
        'WhatsApp text send failed',
      )

      return {
        status: NotificationStatus.FAILED,
        failureReason: `${retryable ? '[retryable] ' : '[permanent] '}${message}`,
      }
    }
  },
}
