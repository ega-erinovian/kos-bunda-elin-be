import { Router } from 'express'
import authRoutes from '../modules/auth/auth.route.js'
import kamarRoutes from '../modules/kamar/kamar.route.js'
import penyewaRoutes from '../modules/penyewa/penyewa.route.js'
import pembayaranRoutes from '../modules/pembayaran/pembayaran.route.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRoutes)
router.use('/kamar', kamarRoutes)
router.use('/penyewa', penyewaRoutes)
router.use('/pembayaran', pembayaranRoutes)

export default router
