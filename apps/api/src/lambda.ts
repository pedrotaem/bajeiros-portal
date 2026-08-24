// Entry point de produção (fase 11): mesmo app, adapter Lambda do Hono.
import { handle } from 'hono/aws-lambda'
import { app } from './app'

export const handler = handle(app)
