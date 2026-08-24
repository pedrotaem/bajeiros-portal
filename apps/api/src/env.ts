const def = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/bajeiros',
  APP_DATABASE_URL: 'postgres://bajeiros_app:bajeiros_app@localhost:5433/bajeiros',
  AUTH_MODE: 'dev',
  DEV_JWT_SECRET: 'dev-secret-nao-usar-em-prod',
  COGNITO_ISSUER: '',
  PORT: '8787',
  GATEWAY_URL: 'http://localhost:8788',
  ASSISTANT_RATE_SALT: 'dev-salt-nao-usar-em-prod',
}

type EnvKey = keyof typeof def

export function env(key: EnvKey): string {
  return process.env[key] ?? def[key]
}
