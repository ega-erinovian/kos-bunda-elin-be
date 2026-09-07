export function mapReminderConfig(config: any) {
  return {
    offsets: config.offsets,
    channels: config.channels,
    active: config.active,
    updatedAt: config.updatedAt?.toISOString ? config.updatedAt.toISOString() : config.updatedAt,
  }
}
