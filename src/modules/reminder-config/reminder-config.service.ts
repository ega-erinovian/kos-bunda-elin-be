import prisma from '../../config/prisma.js'
import { getDefaultPropertyId } from '../../config/property.js'
import { AppError } from '../../utils/apiError.js'
import type { ReminderConfigUpdateInput } from './reminder-config.schema.js'

export async function getReminderConfig() {
  const propertyId = getDefaultPropertyId()
  let config = await prisma.reminderConfig.findUnique({ where: { propertyId } })
  if (!config) {
    // Create default if not exists
    config = await prisma.reminderConfig.create({
      data: {
        propertyId,
        offsets: [-7, -3, -1, 0, 1, 3, 7],
        channels: ['WEB_PUSH'],
        active: true,
      },
    })
  }
  return config
}

export async function updateReminderConfig(input: ReminderConfigUpdateInput) {
  const propertyId = getDefaultPropertyId()
  const existing = await prisma.reminderConfig.findUnique({ where: { propertyId } })
  if (!existing) {
    // Create if not exists
    return prisma.reminderConfig.create({
      data: {
        propertyId,
        offsets: input.offsets,
        channels: input.channels as any,
        active: input.active,
      },
    })
  }
  return prisma.reminderConfig.update({
    where: { propertyId },
    data: {
      offsets: input.offsets,
      channels: input.channels as any,
      active: input.active,
    },
  })
}
