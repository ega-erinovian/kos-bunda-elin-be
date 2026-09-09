import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import pinoHttp from 'pino-http'
import routes from './routes/index.js'
import { errorMiddleware } from './middlewares/error.middleware.js'
import logger from './config/logger.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }))
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
)
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(pinoHttp({ logger }))

app.use('/api', routes)

app.use(errorMiddleware)

export default app
