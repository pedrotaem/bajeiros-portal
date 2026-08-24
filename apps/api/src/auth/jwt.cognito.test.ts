// Caminho cognito do verifyToken, com JWKS local (sem rede). Unit puro:
// não sobe app nem banco; AUTH_MODE é trocado só neste arquivo e restaurado.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertAuthEnv } from '../env'
import { configureJwks, signDevToken, verifyToken } from './jwt'

const ISSUER = 'https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_TESTE123'
const CLIENT_ID = 'client-abc'

let privateKey: CryptoKey
const savedEnv: Record<string, string | undefined> = {}

function baseClaims() {
  return {
    token_use: 'id',
    email: 'ana@example.com',
    email_verified: true,
    name: 'Ana',
  }
}

async function sign(
  claims: Record<string, unknown>,
  opts: { issuer?: string; audience?: string; exp?: string | number } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('11111111-2222-3333-4444-555555555555')
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(privateKey)
}

beforeAll(async () => {
  for (const k of ['AUTH_MODE', 'COGNITO_ISSUER', 'COGNITO_CLIENT_ID']) {
    savedEnv[k] = process.env[k]
  }
  process.env.AUTH_MODE = 'cognito'
  process.env.COGNITO_ISSUER = ISSUER
  process.env.COGNITO_CLIENT_ID = CLIENT_ID

  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey as CryptoKey
  const jwk = await exportJWK(pair.publicKey)
  configureJwks(createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', use: 'sig' }] }))
})

afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  configureJwks(undefined)
})

describe('verifyToken em AUTH_MODE=cognito', () => {
  it('aceita ID token válido e mapeia claims', async () => {
    const claims = await verifyToken(await sign(baseClaims()))
    expect(claims).toEqual({
      sub: '11111111-2222-3333-4444-555555555555',
      email: 'ana@example.com',
      name: 'Ana',
    })
  })

  it('rejeita aud de outro client', async () => {
    await expect(verifyToken(await sign(baseClaims(), { audience: 'outro' }))).rejects.toThrow()
  })

  it('rejeita access token (token_use != id)', async () => {
    await expect(verifyToken(await sign({ ...baseClaims(), token_use: 'access' }))).rejects.toThrow(
      /token_use/,
    )
  })

  it('rejeita issuer de outro pool', async () => {
    await expect(
      verifyToken(
        await sign(baseClaims(), {
          issuer: 'https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_OUTRO',
        }),
      ),
    ).rejects.toThrow()
  })

  it('rejeita token expirado além da tolerância de clock', async () => {
    const past = Math.floor(Date.now() / 1000) - 600
    await expect(verifyToken(await sign(baseClaims(), { exp: past }))).rejects.toThrow()
  })

  it('rejeita e-mail não verificado', async () => {
    await expect(
      verifyToken(await sign({ ...baseClaims(), email_verified: false })),
    ).rejects.toThrow(/verificado/)
  })

  it('rejeita token HS256 do modo dev', async () => {
    const dev = await signDevToken({ sub: 'x', email: 'x@x', name: 'X' })
    await expect(verifyToken(dev)).rejects.toThrow()
  })
})

describe('assertAuthEnv', () => {
  it('passa com config completa', () => {
    expect(() => assertAuthEnv()).not.toThrow()
  })

  it('rejeita issuer vazio ou malformado', () => {
    process.env.COGNITO_ISSUER = ''
    expect(() => assertAuthEnv()).toThrow(/COGNITO_ISSUER/)
    process.env.COGNITO_ISSUER = 'http://cognito-idp.sa-east-1.amazonaws.com/x'
    expect(() => assertAuthEnv()).toThrow(/COGNITO_ISSUER/)
    process.env.COGNITO_ISSUER = ISSUER
  })

  it('rejeita client id ausente', () => {
    process.env.COGNITO_CLIENT_ID = ''
    expect(() => assertAuthEnv()).toThrow(/COGNITO_CLIENT_ID/)
    process.env.COGNITO_CLIENT_ID = CLIENT_ID
  })
})
