import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertProdEnv } from '../env'

const KEYS = [
  'AUTH_MODE',
  'ASSISTANT_RATE_SALT',
  'DEV_JWT_SECRET',
  'DB_MODE',
  'DB_CLUSTER_ARN',
  'DB_SECRET_ARN',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('assertProdEnv', () => {
  it('dev local (defaults) passa', () => {
    expect(() => assertProdEnv()).not.toThrow()
  })

  it('cognito com salt default de dev → erro', () => {
    process.env.AUTH_MODE = 'cognito'
    expect(() => assertProdEnv()).toThrow('ASSISTANT_RATE_SALT')
  })

  it('cognito com salt próprio passa; com DEV_JWT_SECRET default setado → erro', () => {
    process.env.AUTH_MODE = 'cognito'
    process.env.ASSISTANT_RATE_SALT = 'salt-de-prod'
    expect(() => assertProdEnv()).not.toThrow()
    process.env.DEV_JWT_SECRET = 'dev-secret-nao-usar-em-prod'
    expect(() => assertProdEnv()).toThrow('DEV_JWT_SECRET')
  })

  it('data-api sem ARNs → erro; com ARNs passa', () => {
    process.env.DB_MODE = 'data-api'
    expect(() => assertProdEnv()).toThrow('DB_CLUSTER_ARN')
    process.env.DB_CLUSTER_ARN = 'arn:aws:rds:sa-east-1:1:cluster:x'
    process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:sa-east-1:1:secret:y'
    expect(() => assertProdEnv()).not.toThrow()
  })
})
