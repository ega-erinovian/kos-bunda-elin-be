export function mapMessageTemplate(template: any) {
  return {
    id: template.id,
    channel: template.channel,
    jenis: template.jenis,
    isi: template.isi,
    aktif: template.aktif,
    updatedAt: template.updatedAt?.toISOString ? template.updatedAt.toISOString() : template.updatedAt,
  }
}
