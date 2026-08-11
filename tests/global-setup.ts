import path from 'node:path'
import { execSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

async function ensureDatabaseExists(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const dbName = url.pathname.split('/')[1].split('?')[0]

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'

  const client = new PrismaClient({ adapter: new PrismaPg(adminUrl.toString()) })
  try {
    const existing = await client.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS "exists"
    `
    if (!existing[0]?.exists) {
      await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
      console.log(`Created test database: ${dbName}`)
    }
  } finally {
    await client.$disconnect()
  }
}

export default async function globalSetup() {
  loadEnv({ path: path.resolve(__dirname, '..', '.env.test'), override: true })

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing in .env.test')
  }

  await ensureDatabaseExists(databaseUrl)

  const childEnv = { ...process.env, DATABASE_URL: databaseUrl }

  console.log('Running migrations on test database...')
  execSync('npx prisma migrate deploy', {
    env: childEnv,
    stdio: 'inherit',
    timeout: 300000,
  })

  console.log('Seeding test database...')
  execSync('npx tsx prisma/seed.ts', {
    env: childEnv,
    stdio: 'inherit',
    timeout: 300000,
  })
}
