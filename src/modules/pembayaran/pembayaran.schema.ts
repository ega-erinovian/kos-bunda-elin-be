import { z } from 'zod'

export const pembayaranListQuerySchema = z.object({
  status: z
    .enum(['akan_jatuh_tempo', 'menunggak', 'belum_bayar', 'sebagian', 'lunas', 'terlambat'])
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
  tanggalJatuhTempo: z.coerce.date().optional(),
  catatan: z.string().optional().nullable(),
})

export const createPaymentRecordSchema = z.object({
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'QRIS', 'E_WALLET', 'OTHER'], {
    message: 'paymentMethod harus salah satu dari: CASH, BANK_TRANSFER, QRIS, E_WALLET, OTHER',
  }),
  paymentDate: z.coerce.date({
    message: 'paymentDate harus tanggal valid',
  }).refine(
    (date) => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 59, 999)
      return date <= tomorrow
    },
    { message: 'paymentDate tidak boleh lebih dari 1 hari ke depan' }
  ),
  amountPaid: z
    .number()
    .positive({ message: 'amountPaid harus lebih dari 0' })
    .or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  financialAccountId: z.string().uuid().optional(),
})

export type PembayaranListQuery = z.infer<typeof pembayaranListQuerySchema>
export type CreatePembayaranInput = z.infer<typeof createPembayaranSchema>
export type UpdatePembayaranInput = z.infer<typeof updatePembayaranSchema>
export type CreatePaymentRecordInput = z.infer<typeof createPaymentRecordSchema>
