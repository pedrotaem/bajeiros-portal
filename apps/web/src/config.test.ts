import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAppConfig } from './config'

function respondeCom(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: async () => body } as unknown as Response),
  )
}

const cognito = { domain: 'https://exemplo.auth.sa-east-1.amazoncognito.com', clientId: 'abc123' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('config do ambiente — cortina (DF-27 FR-DF27.1)', () => {
  it('preserva comingSoon:true no caminho cognito', async () => {
    respondeCom({ authMode: 'cognito', comingSoon: true, cognito })
    expect((await loadAppConfig()).comingSoon).toBe(true)
  })

  it('normaliza qualquer coisa que não seja o booleano true para false', async () => {
    respondeCom({ authMode: 'cognito', comingSoon: 'true', cognito })
    expect((await loadAppConfig()).comingSoon).toBe(false)
  })

  it('config sem o campo sai desligada', async () => {
    respondeCom({ authMode: 'cognito', cognito })
    expect((await loadAppConfig()).comingSoon).toBe(false)
  })

  it('falha de leitura cai no modo dev e NUNCA inventa cortina (fail-open, §6)', async () => {
    respondeCom({ authMode: 'cognito', comingSoon: true, cognito }, false)
    expect(await loadAppConfig()).toEqual({ authMode: 'dev' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await loadAppConfig()).toEqual({ authMode: 'dev' })
  })
})
