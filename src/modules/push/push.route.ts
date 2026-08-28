import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { pushSubscribeSchema, pushUnsubscribeSchema } from './push.schema.js'
import * as pushController from './push.controller.js'

const router = Router()

router.use(requireAuth)

router.post('/subscribe', validate(pushSubscribeSchema), pushController.subscribe)
router.post('/unsubscribe', validate(pushUnsubscribeSchema), pushController.unsubscribe)
router.get('/:penyewaId', pushController.list)

export default router
