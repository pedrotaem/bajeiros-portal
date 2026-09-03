import type { AppConfig } from './config'
import type { UserInfo } from './session'

/**
 * DF-27 — a decisão da cortina "Em breve", isolada em função pura porque é a regra
 * inteira da feature: um campo do `config.json` do ambiente e o `isAdmin` que a API
 * devolve no `POST /me` (DF-9). Nada além disso decide o que produção mostra.
 *
 * A cortina é de PRODUTO, não de acesso (DF-27 §9): o que protege dado continua sendo
 * o JWT + RLS da API, antes e depois desta feature.
 */
export function mostrarCortina(
  config: Pick<AppConfig, 'comingSoon'>,
  user: Pick<UserInfo, 'isAdmin'> | null,
): boolean {
  return config.comingSoon === true && user?.isAdmin !== true
}
