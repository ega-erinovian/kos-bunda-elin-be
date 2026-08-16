import { z } from 'zod'

export const pembayaranListQuerySchema = z.object({
  status: z
    .enum(['akan_jatuh_tempo', 'menunggak', 'belum_bayar', 'lunas', 'terlambat'])
    .optional(),
  penyewaId: z.string().uuid().optional(),
  periodeBulan: z.coerce.number().int().min(1).max(12).optional(),
  periodeTahun: z.coerce.number().int().min(2020).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const createPembayaranSchema = z.object({
  penyewaId: z.string().uuid({ message: 'penyewaId harus UUID valid' }),
  periodeBulan: z.number().int().min(1).max(12, { message: 'periodeBulan harus 1-12' }),
  periodeTahun: z.number().int().min(2020, { message: 'periodeTahun harus >= 2020' }),
  tanggalJatuhTempo: z.coerce.date({ message: 'tanggalJatuhTempo harus tanggal valid' }),
  nominal: z
    .number()
    .positive({ message: 'nominal harus lebih dari 0' })
    .or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  catatan: z.string().optional(),
})

export const updatePembayaranSchema = z.object({
  status: z.enum(['BELUM_BAYAR', 'LUNAS', 'TERLAMBAT']).optional(),
  tanggalBayar: z.coerce.date().optional().nullable(),
  nominal: z
    .number()
    .positive({ message: 'nominal harus lebih dari 0' })
    .or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number))
    .optional(),
  catatan: z.string().optional().nullable(),
})

export type PembayaranListQuery = z.infer<typeof pembayaranListQuerySchema>
export type CreatePembayaranInput = z.infer<typeof createPembayaranSchema>
export type UpdatePembayaranInput = z.infer<typeof updatePembayaranSchema>
