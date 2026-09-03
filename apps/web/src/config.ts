// Config por ambiente, buscada no boot (o deploy publica /config.json por env;
// o build é único p/ staging e prod). Sem o arquivo (dev local via vite) ou com
// qualquer falha, cai no modo dev — comportamento local inalterado.

export interface AppConfig {
  authMode: 'dev' | 'cognito'
  /**
   * DF-27 — cortina "Em breve". Ausente = desligada. Só produção define `true`; o
   * fallback de dev nunca liga a cortina (fail-open deliberado, DF-27 §6).
   */
  comingSoon?: boolean
  cognito?: {
    domain: string
    clientId: string
    // IdPs sociais habilitados no pool (DF-17). Ausente/vazio = só e-mail e senha.
    providers?: 'google'[]
  }
}

const DEV_CONFIG: AppConfig = { authMode: 'dev' }

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (!res.ok) return DEV_CONFIG
    const data = (await res.json()) as AppConfig
    if (data.authMode === 'cognito' && data.cognito?.domain && data.cognito.clientId) {
      // normaliza p/ booleano: só o `true` explícito liga a cortina (DF-27 FR-DF27.1)
      return { ...data, comingSoon: data.comingSoon === true }
    }
    return DEV_CONFIG
  } catch {
    return DEV_CONFIG
  }
}
