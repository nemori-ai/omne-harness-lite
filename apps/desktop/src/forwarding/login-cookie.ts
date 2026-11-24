import { loginStateCodec, type LoginStateId } from '@omne-harness/legal-identity'

export type CookieLogin = Readonly<{ proof: string; tenant: string; loginId: LoginStateId }>

export const LOGIN_COOKIE = 'omne_login'

/** Not the login's lifetime: the server decides that. The cookie only must not be lost first. */
export const LOGIN_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60

export const LOGIN_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'Strict',
  path: '/bridge/',
} as const

const MAX_VALUE_LENGTH = 3_800

export function writeCookieLogin(login: CookieLogin): string {
  const loginId = loginStateCodec.encode(login.loginId)
  if (!loginId.ok) throw new TypeError('a login id decoded from an answer did not encode')
  return Buffer.from(
    JSON.stringify({ proof: login.proof, tenant: login.tenant, loginId: loginId.value }),
  ).toString('base64url')
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

export function readCookieLogin(value: string): CookieLogin | undefined {
  if (value.length > MAX_VALUE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const fields = parsed as Record<string, unknown>
  const proof = text(fields['proof'])
  const tenant = text(fields['tenant'])
  const loginId = loginStateCodec.parse(text(fields['loginId']) ?? '')
  if (proof === undefined || tenant === undefined || !loginId.ok) return undefined
  return { proof, tenant, loginId: loginId.value }
}
