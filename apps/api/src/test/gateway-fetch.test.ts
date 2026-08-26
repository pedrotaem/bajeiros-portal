import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gatewayFetch, gatewayUrl, resetGatewayAuth } from '../modules/assistant/gateway-fetch'

// G3: proxy do assistente assina SigV4 quando GATEWAY_AUTH=iam (Function URL
// AWS_IAM do gateway). Sem a flag, fetch puro (dev local).

const saved = { ...process.env }

beforeEach(() => {
  resetGatewayAuth()
})

afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
  resetGatewayAuth()
})

describe('gatewayUrl', () => {
  it('remove barra final da Function URL (evita //v1/chat → 404)', () => {
    process.env.GATEWAY_URL = 'https://abc.lambda-url.sa-east-1.on.aws/'
    expect(gatewayUrl('/v1/chat')).toBe('https://abc.lambda-url.sa-east-1.on.aws/v1/chat')
  })
})

describe('gatewayFetch', () => {
  it('sem GATEWAY_AUTH: fetch puro, sem Authorization', async () => {
    process.env.GATEWAY_URL = 'https://gw.example'
    delete process.env.GATEWAY_AUTH
    const spy = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', spy)
    await gatewayFetch('/v1/chat', { method: 'POST', body: '{}' })
    expect(spy).toHaveBeenCalledWith('https://gw.example/v1/chat', expect.anything())
  })

  it('GATEWAY_AUTH=iam: assina SigV4 (Authorization AWS4-HMAC-SHA256, service lambda)', async () => {
    process.env.GATEWAY_URL = 'https://abc.lambda-url.sa-east-1.on.aws/'
    process.env.GATEWAY_AUTH = 'iam'
    process.env.AWS_ACCESS_KEY_ID = 'AKIATESTE'
    process.env.AWS_SECRET_ACCESS_KEY = 'segredo-de-teste'
    process.env.AWS_SESSION_TOKEN = 'token-de-teste'
    process.env.AWS_REGION = 'sa-east-1'
    const spy = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', spy)

    await gatewayFetch('/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"x":1}',
    })

    const req = spy.mock.calls[0][0] as Request
    const auth = req.headers.get('authorization') ?? ''
    expect(auth).toContain('AWS4-HMAC-SHA256')
    expect(auth).toContain('AKIATESTE')
    expect(auth).toContain('sa-east-1/lambda/aws4_request')
    expect(req.headers.get('x-amz-security-token')).toBe('token-de-teste')
    expect(req.url).toBe('https://abc.lambda-url.sa-east-1.on.aws/v1/chat')
  })

  it('GATEWAY_AUTH=iam sem credenciais → erro claro', async () => {
    process.env.GATEWAY_URL = 'https://gw.example'
    process.env.GATEWAY_AUTH = 'iam'
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    await expect(gatewayFetch('/v1/chat', {})).rejects.toThrow(/credenciais/)
  })
})
