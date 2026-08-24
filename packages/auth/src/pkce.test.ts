import { describe, expect, it } from 'vitest'
import { codeChallengeS256, generateCodeVerifier, randomState } from './pkce'

const B64URL = /^[A-Za-z0-9_-]+$/

describe('pkce', () => {
  it('challenge S256 bate com o vetor da RFC 7636 (apêndice B)', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('verifier e state são base64url sem padding e não repetem', () => {
    const v1 = generateCodeVerifier()
    const v2 = generateCodeVerifier()
    expect(v1).toMatch(B64URL)
    expect(v1).not.toBe(v2)
    expect(v1.length).toBeGreaterThanOrEqual(43) // 32 bytes → 43 chars
    const s = randomState()
    expect(s).toMatch(B64URL)
    expect(s).not.toContain('=')
  })
})
