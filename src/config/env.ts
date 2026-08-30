import 'dotenv/config'
import z from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string(),

  ACCESS_TOKEN_SECRET: z.string().min(1),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  ACCESS_COOKIE_NAME: z.string().default('access_token'),
  REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  DEFAULT_PROPERTY_ID: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@kosbundaelin.test'),
  SEED_ADMIN_PASSWORD: z.string().min(1).default('ChangeMe123!'),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  REMINDER_CRON_SCHEDULE: z.string().default('0 8 * * *'),
  TZ: z.string().default('Asia/Jakarta'),

  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),
  WHATSAPP_MAX_RETRY: z.coerce.number().int().min(0).max(10).default(3),

  NOTIFICATION_RETRY_CRON_SCHEDULE: z.string().default('*/15 * * * *'),

  REPORTS_MAX_RANGE_DAYS: z.coerce.number().int().positive().default(1100),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
