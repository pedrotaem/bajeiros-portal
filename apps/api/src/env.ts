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
  // fase 11 — driver RDS Data API (Lambda). Defaults mantêm dev/test em pg.
  DB_MODE: 'pg',
  DB_CLUSTER_ARN: '',
  DB_SECRET_ARN: '',
  DB_NAME: 'bajeiros',
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

// Fail-fast de produção: nenhum default de dev pode passar batido num ambiente
// cognito/data-api. Inócuo em dev (AUTH_MODE=dev + DB_MODE=pg pulam tudo).
export function assertProdEnv(): void {
  if (env('AUTH_MODE') === 'cognito') {
    if (env('ASSISTANT_RATE_SALT') === def.ASSISTANT_RATE_SALT) {
      throw new Error('AUTH_MODE=cognito exige ASSISTANT_RATE_SALT próprio (default de dev ativo)')
    }
    if (process.env.DEV_JWT_SECRET === def.DEV_JWT_SECRET) {
      throw new Error(
        'AUTH_MODE=cognito com DEV_JWT_SECRET default de dev setado — config suspeita, remova a variável',
      )
    }
  }
  if (env('DB_MODE') === 'data-api') {
    if (!env('DB_CLUSTER_ARN') || !env('DB_SECRET_ARN')) {
      throw new Error('DB_MODE=data-api exige DB_CLUSTER_ARN e DB_SECRET_ARN')
    }
  }
}
