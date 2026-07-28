import { Router } from 'express'
import { validate } from '../../middlewares/validate.middleware.js'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { loginSchema } from './auth.schema.js'
import * as authController from './auth.controller.js'

const router = Router()

router.post('/login', validate(loginSchema, 'body'), authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)
router.get('/me', requireAuth, authController.me)

export default router
