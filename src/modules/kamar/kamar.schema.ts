import z from 'zod'

export const statusKamarEnum = z.enum(['KOSONG', 'TERISI', 'NONAKTIF'])

export const createKamarSchema = z.object({
  nomor: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Nomor kamar wajib diisi'
          : 'Nomor kamar harus berupa teks',
    })
    .trim()
    .min(1, 'Nomor kamar wajib diisi'),

  lantai: z
    .string({
      error: (issue) => {
        if (issue.input === undefined) return 'Lantai wajib diisi'
        if (issue.input === null) return 'Lantai tidak boleh kosong'
        return 'Lantai harus berupa teks'
      },
    })
    .trim()
    .min(1, 'Lantai wajib diisi'),

  harga: z.coerce
    .number({
      error: (issue) => {
        if (issue.input === undefined) return 'Harga wajib diisi'
        if (issue.input === null) return 'Harga tidak boleh kosong'
        return 'Harga harus berupa angka'
      },
    })
    .positive('Harga harus lebih dari 0'),

  status: statusKamarEnum.default('KOSONG'),
})

export const updateKamarSchema = z
  .object({
    nomor: z.string().trim().min(1, 'Nomor kamar wajib diisi'),
    lantai: z.string().trim().optional(),
    harga: z.coerce.number().positive('Harga harus lebih dari 0'),
    status: statusKamarEnum,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang dikirim',
  })

export const idParamsSchema = z.object({
  id: z.uuid(),
})

export const kamarListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: statusKamarEnum.optional(),
  search: z.string().trim().optional(),
})

export type CreateKamarInput = z.infer<typeof createKamarSchema>
export type UpdateKamarInput = z.infer<typeof updateKamarSchema>
export type KamarListQuery = z.infer<typeof kamarListQuerySchema>