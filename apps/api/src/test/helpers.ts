import { randomUUID } from 'node:crypto'
import { signDevToken } from '../auth/jwt'

export interface TestUser {
  sub: string
  email: string
  name: string
  token: string
}

export async function makeUser(name: string): Promise<TestUser> {
  const sub = randomUUID()
  const email = `${name.toLowerCase()}-${sub.slice(0, 8)}@test.dev`
  const token = await signDevToken({ sub, email, name })
  return { sub, email, name, token }
}

export function authed(user: TestUser, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }
}
