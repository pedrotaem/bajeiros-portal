import { serve } from '@hono/node-server'
import { app } from './app'
import { env } from './env'

const port = Number(env('PORT'))
serve({ fetch: app.fetch, port }, () => {
  console.log(
    `bajeiros-api dev em http://localhost:${port}/api/v1/health (AUTH_MODE=${env('AUTH_MODE')})`,
  )
})
