// Entry point de produção (fase 11): mesmo app, adapter Lambda do Hono.
// Asserts no module scope = cold start falha ALTO com config incompleta,
// em vez de erro opaco na 1ª request.
import { handle } from 'hono/aws-lambda'
import { assertAuthEnv, assertProdEnv } from './env'
import { app } from './app'

assertAuthEnv()
assertProdEnv()

export const handler = handle(app)
