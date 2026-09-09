import { z } from 'zod'

export const auditLogListQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  propertyId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>
