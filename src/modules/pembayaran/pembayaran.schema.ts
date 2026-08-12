import z from 'zod'

export const statusPembayaranEnum = z.enum(['BELUM_BAYAR', 'LUNAS', 'TERLAMBAT'])

const periodeBulanSchema = z.coerce
  .number()
  .int()
  .min(1, 'Periode bulan harus 1-12')
  .max(12, 'Periode bulan harus 1-12')

const periodeTahunSchema = z.coerce
  .number()
  .int()
  .min(2000, 'Periode tahun tidak valid')
  .max(2100, 'Periode tahun tidak valid')

export const createPembayaranSchema = z.object({
  penyewaId: z.uuid('ID penyewa tidak valid'),
  periodeBulan: periodeBulanSchema,
  periodeTahun: periodeTahunSchema,
  tanggalJatuhTempo: z.coerce.date().optional(),
  status: statusPembayaranEnum.optional(),
  tanggalBayar: z.coerce.date().nullable().optional(),
  nominal: z.coerce.number().positive('Nominal harus lebih dari 0').optional(),
  catatan: z.string().trim().optional(),
})

export const updatePembayaranSchema = z
  .object({
    penyewaId: z.uuid('ID penyewa tidak valid'),
    periodeBulan: periodeBulanSchema,
    periodeTahun: periodeTahunSchema,
    tanggalJatuhTempo: z.coerce.date(),
    status: statusPembayaranEnum,
    tanggalBayar: z.coerce.date().nullable(),
    nominal: z.coerce.number().positive('Nominal harus lebih dari 0'),
    catatan: z.string().trim(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang dikirim',
  })

export const idParamsSchema = z.object({
  id: z.uuid(),
})

export const pembayaranListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .union([statusPembayaranEnum, z.literal('akan_jatuh_tempo'), z.literal('menunggak')])
    .optional(),
  penyewaId: z.uuid('ID penyewa tidak valid').optional(),
  periodeBulan: periodeBulanSchema.optional(),
  periodeTahun: periodeTahunSchema.optional(),
  search: z.string().trim().optional(),
})

export type CreatePembayaranInput = z.infer<typeof createPembayaranSchema>
export type UpdatePembayaranInput = z.infer<typeof updatePembayaranSchema>
export type PembayaranListQuery = z.infer<typeof pembayaranListQuerySchema>