import { Router } from 'express'
import authRoutes from '../modules/auth/auth.route.js'
import kamarRoutes from '../modules/kamar/kamar.route.js'
import penyewaRoutes from '../modules/penyewa/penyewa.route.js'
import pembayaranRoutes from '../modules/pembayaran/pembayaran.route.js'
import messageTemplateRoutes from '../modules/message-template/message-template.route.js'
import reminderConfigRoutes from '../modules/reminder-config/reminder-config.route.js'
import notificationLogRoutes from '../modules/notification-log/notification-log.route.js'
import notificationRoutes from '../modules/notification/notification.route.js'
import pushRoutes from '../modules/push/push.route.js'
import whatsappWebhookRoutes from '../modules/notification/whatsapp-webhook.route.js'
import financialAccountRoutes from '../modules/financial-account/financial-account.route.js'
import financialCategoryRoutes from '../modules/financial-category/financial-category.route.js'
import financialTransactionRoutes from '../modules/financial-transaction/financial-transaction.route.js'
import auditRoutes from '../modules/audit/audit.route.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/notification', whatsappWebhookRoutes)

router.use('/auth', authRoutes)
router.use('/kamar', kamarRoutes)
router.use('/penyewa', penyewaRoutes)
router.use('/pembayaran', pembayaranRoutes)
router.use('/message-template', messageTemplateRoutes)
router.use('/reminder-config', reminderConfigRoutes)
router.use('/notification-log', notificationLogRoutes)
router.use('/notification', notificationRoutes)
router.use('/push', pushRoutes)

router.use('/finance/accounts', financialAccountRoutes)
router.use('/finance/categories', financialCategoryRoutes)
router.use('/finance/transactions', financialTransactionRoutes)
router.use('/audit-log', auditRoutes)

export default router
