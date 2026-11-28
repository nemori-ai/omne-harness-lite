import type { Outcome } from '@omne-harness/operation-result'
import type { OAuthAnswer, PendingAuthorization } from '@omne-harness/mcp-contract/provider'
import { isPlain, scopesOf, textOf, wholeOf } from './plain.ts'

export type TokenReading =
  | Readonly<{
      kind: 'issued'
      access: string
      refresh?: string
      expiresIn?: number
      scopes?: readonly string[]
    }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>

const UNKNOWN: TokenReading = { kind: 'unknown' }

const isRefusal = (status: number, json: unknown): boolean =>
  (status === 400 || status === 401) && textOf(json, 'error') !== undefined

/** RFC 6749 section 5: an error answer of 400 or 401 is a refusal; no answer, 5xx or an unreadable success is not known. */
export function readTokenAnswer(answer: Outcome<OAuthAnswer, 'no-answer'>): TokenReading {
  if ('failure' in answer) return UNKNOWN
  const { status, json } = answer.ok
  if (isRefusal(status, json)) return { kind: 'refused' }
  return status === 200 && isPlain(json) ? issuedOf(json) : UNKNOWN
}

function issuedOf(json: unknown): TokenReading {
  const access = textOf(json, 'access_token')
  const type = textOf(json, 'token_type')
  if (access === undefined || type?.toLowerCase() !== 'bearer') return UNKNOWN
  const refresh = textOf(json, 'refresh_token')
  const expiresIn = wholeOf(json, 'expires_in')
  const scope = textOf(json, 'scope')
  return {
    kind: 'issued',
    access,
    ...(refresh === undefined ? {} : { refresh }),
    ...(expiresIn === undefined ? {} : { expiresIn }),
    ...(scope === undefined ? {} : { scopes: scopesOf(scope) }),
  }
}

export type CallbackQuery = Readonly<{
  state?: string
  code?: string
  error?: string
  iss?: string
}>

export type CallbackVerdict =
  | Readonly<{ kind: 'exchange'; code: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'rejected'; reason: 'expired' | 'issuer' | 'malformed' }>

/** RFC 9207 first: an error answer whose issuer does not check out is not adopted, and its words are not shown. */
export function judgeCallback(
  pending: PendingAuthorization,
  query: CallbackQuery,
  now: number,
): CallbackVerdict {
  if (now >= pending.expiresAt) return { kind: 'rejected', reason: 'expired' }
  const iss = query.iss
  if (iss === undefined ? pending.issRequired : iss !== pending.issuer)
    return { kind: 'rejected', reason: 'issuer' }
  if (query.error !== undefined) return { kind: 'denied' }
  if (query.code === undefined || query.code === '')
    return { kind: 'rejected', reason: 'malformed' }
  return { kind: 'exchange', code: query.code }
}
