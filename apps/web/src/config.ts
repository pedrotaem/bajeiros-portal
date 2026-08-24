// Config por ambiente, buscada no boot (o deploy publica /config.json por env;
// o build é único p/ staging e prod). Sem o arquivo (dev local via vite) ou com
// qualquer falha, cai no modo dev — comportamento local inalterado.

export interface AppConfig {
  authMode: 'dev' | 'cognito'
  cognito?: {
    domain: string
    clientId: string
  }
}

const DEV_CONFIG: AppConfig = { authMode: 'dev' }

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (!res.ok) return DEV_CONFIG
    const data = (await res.json()) as AppConfig
    if (data.authMode === 'cognito' && data.cognito?.domain && data.cognito.clientId) return data
    return DEV_CONFIG
  } catch {
    return DEV_CONFIG
  }
}
