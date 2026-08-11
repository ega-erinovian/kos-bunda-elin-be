import z from 'zod'

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Nomor HP tidak valid')
  .transform((value) => (value.startsWith('+') ? value.slice(1) : value).replace(/^0/, '62'))

export const createPenyewaSchema = z.object({
  nama: z.string().trim().min(1, 'Nama penyewa wajib diisi'),
  noHp: phoneSchema,
  kamarId: z.uuid(),
  tanggalMulaiSewa: z.coerce.date(),
  nominalSewa: z.coerce.number().positive('Nominal sewa harus lebih dari 0'),
  tanggalJatuhTempo: z.number().int().min(1).max(28, 'Jatuh tempo harus 1-28'),
})

export const updatePenyewaSchema = z
  .object({
    nama: z.string().trim().min(1, 'Nama penyewa wajib diisi'),
    noHp: phoneSchema,
    kamarId: z.uuid(),
    tanggalMulaiSewa: z.coerce.date(),
    nominalSewa: z.coerce.number().positive('Nominal sewa harus lebih dari 0'),
    tanggalJatuhTempo: z.number().int().min(1).max(28, 'Jatuh tempo harus 1-28'),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang dikirim',
  })

export const keluarPenyewaSchema = z.object({
  tanggalKeluar: z.coerce.date().optional(),
})

export const idParamsSchema = z.object({
  id: z.uuid(),
})

export const penyewaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  aktif: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().optional(),
})

export type CreatePenyewaInput = z.infer<typeof createPenyewaSchema>
export type UpdatePenyewaInput = z.infer<typeof updatePenyewaSchema>
export type KeluarPenyewaInput = z.infer<typeof keluarPenyewaSchema>
export type PenyewaListQuery = z.infer<typeof penyewaListQuerySchema>