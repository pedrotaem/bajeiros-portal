// Guardas da vinculação Google → conta local (DF-17, AC-5…AC-7). Unit puro: sem
// rede, sem banco, sem app — só o handler e um cliente Cognito de mentira.
import {
  AdminLinkProviderForUserCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePreSignUp, type CognitoSender, type PreSignUpEvent } from './pre-sign-up'

const POOL = 'sa-east-1_TESTE123'
const GOOGLE_SUB = '104729382910293847561'

class FakeCognito implements CognitoSender {
  sent: unknown[] = []
  constructor(
    private users: UserType[] = [],
    private failures: { list?: Error; link?: Error } = {},
  ) {}

  async send(command: unknown): Promise<unknown> {
    this.sent.push(command)
    if (command instanceof ListUsersCommand) {
      if (this.failures.list) throw this.failures.list
      return { Users: this.users }
    }
    if (command instanceof AdminLinkProviderForUserCommand) {
      if (this.failures.link) throw this.failures.link
      return {}
    }
    throw new Error('comando inesperado')
  }

  get linkCommands(): AdminLinkProviderForUserCommand[] {
    return this.sent.filter(
      (c): c is AdminLinkProviderForUserCommand => c instanceof AdminLinkProviderForUserCommand,
    )
  }
}

function event(over: Partial<PreSignUpEvent> = {}): PreSignUpEvent {
  return {
    triggerSource: 'PreSignUp_ExternalProvider',
    userPoolId: POOL,
    userName: `Google_${GOOGLE_SUB}`,
    request: {
      userAttributes: { email: 'ana@usp.br', email_verified: 'true', name: 'Ana' },
    },
    response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
    ...over,
  }
}

function localUser(over: Partial<UserType> = {}): UserType {
  return {
    Username: 'ana@usp.br',
    UserStatus: 'CONFIRMED',
    Attributes: [
      { Name: 'email', Value: 'ana@usp.br' },
      { Name: 'email_verified', Value: 'true' },
    ],
    ...over,
  }
}

let logged: Record<string, unknown>[]

beforeEach(() => {
  logged = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logged.push(JSON.parse(line) as Record<string, unknown>)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const decision = () => logged[logged.length - 1]?.decision

describe('caminho feliz', () => {
  it('vincula a identidade Google ao usuário local e devolve o evento intacto', async () => {
    const cognito = new FakeCognito([localUser()])
    const input = event()

    const out = await handlePreSignUp(input, cognito)

    expect(out).toBe(input)
    expect(out.response).toEqual({
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    })
    expect(cognito.linkCommands).toHaveLength(1)
    expect(cognito.linkCommands[0].input).toEqual({
      UserPoolId: POOL,
      DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'ana@usp.br' },
      SourceUser: {
        ProviderName: 'Google',
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: GOOGLE_SUB,
      },
    })
    expect(decision()).toBe('linked')
  })

  it('procura o usuário local pelo e-mail normalizado', async () => {
    const cognito = new FakeCognito([localUser()])
    await handlePreSignUp(
      event({
        request: { userAttributes: { email: '  Ana@USP.br ', email_verified: 'true' } },
      }),
      cognito,
    )
    const list = cognito.sent[0] as ListUsersCommand
    expect(list.input.Filter).toBe('email = "ana@usp.br"')
    expect(decision()).toBe('linked')
  })

  it('não registra o e-mail em claro no log', async () => {
    await handlePreSignUp(event(), new FakeCognito([localUser()]))
    expect(JSON.stringify(logged)).not.toContain('ana@usp.br')
    expect(logged[logged.length - 1]?.emailTag).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('guardas — nenhuma vincula', () => {
  const naoVincula = async (
    input: PreSignUpEvent,
    users: UserType[] = [localUser()],
  ): Promise<void> => {
    const cognito = new FakeCognito(users)
    const out = await handlePreSignUp(input, cognito)
    expect(out).toBe(input)
    expect(cognito.linkCommands).toHaveLength(0)
  }

  it('triggerSource de cadastro local', async () => {
    await naoVincula(event({ triggerSource: 'PreSignUp_SignUp' }))
    expect(decision()).toBe('not-federated-signup')
  })

  it('usuário de outro provedor', async () => {
    await naoVincula(event({ userName: 'SignInWithApple_000123' }))
    expect(decision()).toBe('other-provider')
  })

  it('evento sem e-mail', async () => {
    await naoVincula(event({ request: { userAttributes: { email_verified: 'true' } } }))
    expect(decision()).toBe('missing-email')
  })

  it('e-mail com aspas (tentativa de injeção no Filter)', async () => {
    await naoVincula(
      event({
        request: { userAttributes: { email: 'a" or email ^ "', email_verified: 'true' } },
      }),
    )
    expect(decision()).toBe('missing-email')
  })

  it('e-mail não verificado no Google', async () => {
    await naoVincula(
      event({ request: { userAttributes: { email: 'ana@usp.br', email_verified: 'false' } } }),
    )
    expect(decision()).toBe('email-not-verified')
  })

  it('email_verified ausente', async () => {
    await naoVincula(event({ request: { userAttributes: { email: 'ana@usp.br' } } }))
    expect(decision()).toBe('email-not-verified')
  })

  it('nenhum usuário local com aquele e-mail (cadastro novo legítimo)', async () => {
    await naoVincula(event(), [])
    expect(decision()).toBe('no-local-user')
  })

  it('dois ou mais usuários com o mesmo e-mail', async () => {
    await naoVincula(event(), [localUser(), localUser({ Username: 'outra' })])
    expect(decision()).toBe('ambiguous-email')
  })

  it('alvo não confirmado', async () => {
    await naoVincula(event(), [localUser({ UserStatus: 'UNCONFIRMED' })])
    expect(decision()).toBe('target-not-confirmed')
  })

  it('alvo sem e-mail verificado no Cognito', async () => {
    await naoVincula(event(), [
      localUser({
        Attributes: [
          { Name: 'email', Value: 'ana@usp.br' },
          { Name: 'email_verified', Value: 'false' },
        ],
      }),
    ])
    expect(decision()).toBe('target-email-not-verified')
  })

  it('alvo já federado (status EXTERNAL_PROVIDER)', async () => {
    await naoVincula(event(), [localUser({ UserStatus: 'EXTERNAL_PROVIDER' })])
    expect(decision()).toBe('target-not-confirmed')
  })

  it('alvo confirmado mas com atributo identities', async () => {
    await naoVincula(event(), [
      localUser({
        Attributes: [
          { Name: 'email', Value: 'ana@usp.br' },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'identities', Value: '[{"providerName":"Google"}]' },
        ],
      }),
    ])
    expect(decision()).toBe('target-already-federated')
  })
})

describe('falha do SDK não derruba o login', () => {
  it('erro no ListUsers', async () => {
    const cognito = new FakeCognito([], { list: new Error('throttled') })
    const input = event()
    expect(await handlePreSignUp(input, cognito)).toBe(input)
    expect(decision()).toBe('link-failed')
  })

  it('erro no AdminLinkProviderForUser', async () => {
    const cognito = new FakeCognito([localUser()], { link: new Error('AliasExistsException') })
    const input = event()
    expect(await handlePreSignUp(input, cognito)).toBe(input)
    expect(decision()).toBe('link-failed')
    expect(logged[logged.length - 1]?.error).toBe('AliasExistsException')
  })
})
