import type { JenisPesan } from '@prisma/client'
import type { NotificationPayload } from '../notification/notification.types.js'

// ---------------------------------------------------------------------------
// Approved Cloud API templates
// ---------------------------------------------------------------------------
//
// Meta requires every template used outside the 24h window to be pre-approved
// in the WhatsApp Business Manager. The names below are **conventions** —
// override them via env if your Meta account uses different names.
//
// Until real templates are approved, the provider defaults to free-form
// `text` messages (valid inside the session window). `getTemplateConfig` is
// the seam to switch to template sends without changing provider code.
//

export interface WhatsAppTemplateConfig {
  name: string
  language: string
}

const DEFAULT_TEMPLATE_MAP: Record<JenisPesan, WhatsAppTemplateConfig> = {
  REMINDER_JATUH_TEMPO: { name: 'reminder_jatuh_tempo', language: 'id' },
  REMINDER_TUNGGAKAN: { name: 'reminder_tunggakan', language: 'id' },
  PENGUMUMAN: { name: 'pengumuman', language: 'id' },
}

/**
 * Resolves the Cloud API template config for a given internal JenisPesan.
 * Returns `null` if no template should be used (fallback to text).
 *
 * Environment overrides (optional):
 *   WHATSAPP_TEMPLATE_REMINDER_JATUH_TEMPO, WHATSAPP_TEMPLATE_REMINDER_TUNGGAKAN, WHATSAPP_TEMPLATE_PENGUMUMAN
 * are not required for Phase 8 but documented as extension points.
 */
export function getWhatsAppTemplateConfig(jenis: JenisPesan): WhatsAppTemplateConfig | null {
  return DEFAULT_TEMPLATE_MAP[jenis] ?? null
}

// ---------------------------------------------------------------------------
// Variable helpers
// ---------------------------------------------------------------------------

/**
 * Builds ordered template body variables from a NotificationPayload.
 *
 * Cloud API templates use positional `{{1}}`, `{{2}}`, … placeholders.
 * We map the structured `templateData` (if present) into a stable order
 * matching the template's expected parameter sequence.
 *
 * Order: nama → kamar → periode → tanggalJatuhTempo → nominal → sisaTagihan → namaProperty
 * Only non-empty values are included; missing slots are rendered as "-".
 */
export function buildTemplateVariables(
  payload: NotificationPayload,
  isi?: string,
): string[] {
  if (payload.templateData && Object.keys(payload.templateData).length > 0) {
    const order = ['nama', 'kamar', 'periode', 'tanggalJatuhTempo', 'nominal', 'sisaTagihan', 'namaProperty'] as const
    return order
      .filter((k) => payload.templateData![k] !== undefined)
      .map((k) => String(payload.templateData![k]))
  }

  // Fallback: extract a short preview from isiRingkas itself.
  if (isi) {
    return [isi.slice(0, 1024)]
  }

  return [payload.isiRingkas.slice(0, 1024)]
}

/**
 * Determines whether a given error from the text-send path indicates
 * "outside 24h window — template required" so the provider can fall back.
 */
export function isTemplateRequiredError(errorBody: unknown): boolean {
  if (!errorBody || typeof errorBody !== 'object') return false
  const str = JSON.stringify(errorBody).toLowerCase()
  return (
    str.includes('131047') ||
    str.includes('outside the allowed window') ||
    str.includes('requires a template') ||
    str.includes('24 hour window')
  )
}

// ---------------------------------------------------------------------------
// Discovery / debug helper
// ---------------------------------------------------------------------------

export const WHATSAPP_TEMPLATE_MAP = DEFAULT_TEMPLATE_MAP
