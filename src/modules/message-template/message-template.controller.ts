import { Request, Response, NextFunction } from 'express'
import * as service from './message-template.service.js'
import { mapMessageTemplate } from './message-template.mapper.js'
import { apiSuccess } from '../../utils/apiResponse.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = req.query.channel as string | undefined
    const data = await service.listTemplates(channel)
    const mapped = data.map(mapMessageTemplate)
    return res.json({ success: true, data: mapped })
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await service.createTemplate(req.body)
    return apiSuccess(res, mapMessageTemplate(template), 201)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await service.updateTemplate(req.params.id as string, req.body.isi)
    return apiSuccess(res, mapMessageTemplate(template))
  } catch (err) {
    next(err)
  }
}
