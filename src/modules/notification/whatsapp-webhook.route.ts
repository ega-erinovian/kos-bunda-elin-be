import { Router } from 'express'
import * as controller from './whatsapp-webhook.controller.js'

const router = Router()

// Public — Meta/Evolution call these unauthenticated. HMAC verified inside controller.
router.get('/whatsapp/webhook', controller.verifyWebhook)
router.post('/whatsapp/webhook', controller.handleWebhook)

export default router
