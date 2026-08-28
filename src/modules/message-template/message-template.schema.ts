import { z } from 'zod'

export const messageTemplateListQuerySchema = z.object({
  channel: z.enum(['WEB_PUSH', 'WHATSAPP', 'EMAIL', 'SMS']).optional(),
})

export const createMessageTemplateSchema = z.object({
  channel: z.enum(['WEB_PUSH', 'WHATSAPP', 'EMAIL', 'SMS']),
  jenis: z.enum(['REMINDER_JATUH_TEMPO', 'REMINDER_TUNGGAKAN', 'PENGUMUMAN']),
  isi: z.string().min(1, 'isi tidak boleh kosong').max(2000),
  aktif: z.boolean().optional().default(true),
})

export const updateMessageTemplateSchema = z.object({
  isi: z.string().min(1, 'isi tidak boleh kosong').max(2000),
})

export const TEMPLATE_PLACEHOLDERS_WHITELIST = [
  'nama',
  'kamar',
  'nominal',
  'periode',
  'periodeBulan',
  'periodeTahun',
  'tanggalJatuhTempo',
  'totalDibayar',
  'sisaTagihan',
  'noHp',
  'status',
  'namaProperty',
] as const

export function validateTemplatePlaceholders(isi: string): string | null {
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(isi)) !== null) {
    const placeholder = match[1]
    if (!TEMPLATE_PLACEHOLDERS_WHITELIST.includes(placeholder as any)) {
      return `Placeholder {{${placeholder}}} tidak dikenal. Whitelist: ${TEMPLATE_PLACEHOLDERS_WHITELIST.join(', ')}`
    }
  }
  return null
}

export type MessageTemplateListQuery = z.infer<typeof messageTemplateListQuerySchema>
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>
