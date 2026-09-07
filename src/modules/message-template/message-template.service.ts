import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type { CreateMessageTemplateInput } from './message-template.schema.js'
import { validateTemplatePlaceholders } from './message-template.schema.js'

export async function listTemplates(channel?: string) {
  const propertyId = getDefaultPropertyId()
  const where: any = { propertyId }
  if (channel) where.channel = channel
  return prisma.messageTemplate.findMany({
    where,
    orderBy: [{ channel: 'asc' }, { jenis: 'asc' }],
  })
}

export async function getTemplateById(id: string) {
  const propertyId = getDefaultPropertyId()
  const template = await prisma.messageTemplate.findFirst({
    where: { id, propertyId },
  })
  if (!template) throw new AppError('MessageTemplate tidak ditemukan', 404)
  return template
}

export async function createTemplate(input: CreateMessageTemplateInput) {
  const propertyId = getDefaultPropertyId()

  const placeholderError = validateTemplatePlaceholders(input.isi)
  if (placeholderError) throw new AppError(placeholderError, 400)

  // Check unique constraint
  const existing = await prisma.messageTemplate.findUnique({
    where: { propertyId_channel_jenis: { propertyId, channel: input.channel as any, jenis: input.jenis as any } },
  })
  if (existing) throw new AppError('Template untuk channel+jenis ini sudah ada', 409)

  return prisma.messageTemplate.create({
    data: {
      propertyId,
      channel: input.channel as any,
      jenis: input.jenis as any,
      isi: input.isi,
      aktif: input.aktif ?? true,
    },
  })
}

export async function updateTemplate(id: string, isi: string) {
  const propertyId = getDefaultPropertyId()
  const template = await prisma.messageTemplate.findFirst({ where: { id, propertyId } })
  if (!template) throw new AppError('MessageTemplate tidak ditemukan', 404)

  const placeholderError = validateTemplatePlaceholders(isi)
  if (placeholderError) throw new AppError(placeholderError, 400)

  return prisma.messageTemplate.update({
    where: { id },
    data: { isi },
  })
}
