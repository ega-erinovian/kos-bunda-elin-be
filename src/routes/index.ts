import { Router } from 'express'
import authRoutes from '../modules/auth/auth.route.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRoutes)

export default router
