// Trigger PreSignUp do Cognito (DF-17 §E3, opção B da spec §3.3).
//
// Quando alguém entra pela primeira vez com o Google e aquele e-mail já pertence a
// uma conta local do pool, vincula as duas identidades ANTES de o Cognito criar um
// usuário novo. Efeito: o ID token do login por Google passa a carregar o `sub` do
// usuário original, e o invariante `users.id = sub` (0001_init.sql) sobrevive sem
// migração nenhuma.
//
// FAIL-CLOSED. Qualquer dúvida — e-mail não verificado no Google, zero ou 2+ contas
// com aquele e-mail, alvo não confirmado ou já federado, erro do SDK — NÃO vincula e
// devolve o evento intacto. O pior caso vira o 409 que `modules/identity` já trata,
// nunca uma vinculação errada.
//
// O risco residual aceito (e por que ele não abre caminho novo de ataque) está na
// spec §8.1: o pool já recupera conta por e-mail verificado, então quem controla a
// caixa postal já tomava a conta pelo "esqueci minha senha".

import {
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { createHash } from 'node:crypto'

const PROVIDER_NAME = 'Google'
// O Cognito nomeia o usuário federado como `<Provedor>_<sub no provedor>`.
const USERNAME_PREFIX = new RegExp(`^${PROVIDER_NAME}_`, 'i')

export interface PreSignUpEvent {
  triggerSource: string
  userPoolId: string
  userName: string
  request: { userAttributes: Record<string, string | undefined> }
  response: { autoConfirmUser?: boolean; autoVerifyEmail?: boolean; autoVerifyPhone?: boolean }
}

// Só o que este handler usa do cliente do SDK — mantém o teste sem rede e sem mock
// do pacote inteiro.
export interface CognitoSender {
  send(command: unknown): Promise<unknown>
}

type Decision =
  | 'linked'
  | 'not-federated-signup'
  | 'other-provider'
  | 'missing-email'
  | 'email-not-verified'
  | 'no-local-user'
  | 'ambiguous-email'
  | 'target-not-confirmed'
  | 'target-email-not-verified'
  | 'target-already-federated'
  | 'link-failed'

// Correlator sem PII no CloudWatch (RF-3.6): dá para casar linhas do mesmo e-mail
// sem que o log vire um dump de endereços.
function emailTag(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12)
}

function log(decision: Decision, event: PreSignUpEvent, extra: Record<string, unknown> = {}): void {
  const email = event.request.userAttributes.email
  console.log(
    JSON.stringify({
      trigger: 'pre-sign-up',
      decision,
      triggerSource: event.triggerSource,
      emailTag: email ? emailTag(email) : null,
      ...extra,
    }),
  )
}

function attr(user: UserType, name: string): string | undefined {
  return user.Attributes?.find((a) => a.Name === name)?.Value
}

// O Cognito entrega atributos mapeados como string; aceitar boolean também deixa o
// handler robusto a mudança de formato sem afrouxar para truthy (que aceitaria
// a string "false").
function isVerified(value: string | boolean | undefined): boolean {
  return value === true || value === 'true'
}

export async function handlePreSignUp(
  event: PreSignUpEvent,
  cognito: CognitoSender,
): Promise<PreSignUpEvent> {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') {
    log('not-federated-signup', event)
    return event
  }
  if (!USERNAME_PREFIX.test(event.userName)) {
    log('other-provider', event)
    return event
  }
  const providerSub = event.userName.replace(USERNAME_PREFIX, '')

  const email = event.request.userAttributes.email?.trim().toLowerCase()
  // aspas/barras quebrariam o Filter do ListUsers; e-mail assim não é confiável
  if (!providerSub || !email || /["\\]/.test(email)) {
    log('missing-email', event)
    return event
  }
  if (!isVerified(event.request.userAttributes.email_verified)) {
    log('email-not-verified', event)
    return event
  }

  try {
    // Limit 2: basta para separar "um candidato" de "ambíguo"
    const found = (await cognito.send(
      new ListUsersCommand({
        UserPoolId: event.userPoolId,
        Filter: `email = "${email}"`,
        Limit: 2,
      }),
    )) as { Users?: UserType[] }
    const users = found.Users ?? []

    if (users.length === 0) {
      log('no-local-user', event) // cadastro novo legítimo — segue o fluxo padrão
      return event
    }
    if (users.length > 1) {
      log('ambiguous-email', event, { count: users.length }) // anômalo: quer olho humano
      return event
    }

    const target = users[0]
    if (target.UserStatus !== 'CONFIRMED' || !target.Username) {
      log('target-not-confirmed', event, { status: target.UserStatus })
      return event
    }
    if (!isVerified(attr(target, 'email_verified'))) {
      log('target-email-not-verified', event)
      return event
    }
    // usuário federado tem status EXTERNAL_PROVIDER e/ou atributo `identities`;
    // nunca vincular um IdP a outro IdP
    if (attr(target, 'identities')) {
      log('target-already-federated', event)
      return event
    }

    await cognito.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: target.Username },
        SourceUser: {
          ProviderName: PROVIDER_NAME,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: providerSub,
        },
      }),
    )
    log('linked', event)
  } catch (e) {
    // Nunca derrubar o login por causa da vinculação (RF-3.7).
    log('link-failed', event, { error: e instanceof Error ? e.message : String(e) })
  }
  return event
}

let client: CognitoIdentityProviderClient | undefined

export const handler = async (event: PreSignUpEvent): Promise<PreSignUpEvent> => {
  client ??= new CognitoIdentityProviderClient({})
  return handlePreSignUp(event, client)
}
