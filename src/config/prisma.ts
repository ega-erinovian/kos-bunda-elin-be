import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg(env.DATABASE_URL, { schema: 'kos-bunda-elin' }),
})

export default prisma
