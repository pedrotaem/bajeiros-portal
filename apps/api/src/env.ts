const def = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/bajeiros',
  APP_DATABASE_URL: 'postgres://bajeiros_app:bajeiros_app@localhost:5433/bajeiros',
  AUTH_MODE: 'dev',
  DEV_JWT_SECRET: 'dev-secret-nao-usar-em-prod',
  COGNITO_ISSUER: '',
  COGNITO_CLIENT_ID: '',
  PORT: '8787',
  GATEWAY_URL: 'http://localhost:8788',
  ASSISTANT_RATE_SALT: 'dev-salt-nao-usar-em-prod',
}

type EnvKey = keyof typeof def

export function env(key: EnvKey): string {
  return process.env[key] ?? def[key]
}

// Fail-fast no boot: em AUTH_MODE=cognito a config incompleta não pode passar
// batida (JWKS com URL vazia falharia só na 1ª request, com erro opaco).
export function assertAuthEnv(): void {
  if (env('AUTH_MODE') !== 'cognito') return
  const issuer = env('COGNITO_ISSUER')
  if (!/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[\w-]+$/.test(issuer)) {
    throw new Error(
      `AUTH_MODE=cognito exige COGNITO_ISSUER no formato https://cognito-idp.<região>.amazonaws.com/<poolId> (recebido: "${issuer}")`,
    )
  }
  if (!env('COGNITO_CLIENT_ID')) {
    throw new Error('AUTH_MODE=cognito exige COGNITO_CLIENT_ID (aud do ID token)')
  }
}
