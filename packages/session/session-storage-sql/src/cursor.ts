// Signed continuation tokens (RD-CURSOR). A token carries its kind, the tenant and session it was
// issued for, an expiry and the continuation state. The signing capability seals it; a token that
// was altered, issued for another tenant or session or kind, expired, or signed by a rotated-out
// key is `invalid`, and an unreadable key is `unavailable`. Nothing is accepted unverified.
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import type { SessionFailure } from '@omne-harness/session-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const OWNER = '@omne-harness/session-storage-sql'

export type CursorBinding = Readonly<{ kind: string; tenant: string | null; session: string | null }>
export type CursorOptions = Readonly<{
  signing: SessionCursorSigning
  now: () => number
  ttlMs: number
}>

const encoder = new TextEncoder()
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')
const unb64 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64url'))

const invalid = (reason: string): Outcome<never, SessionFailure> =>
  fail<SessionFailure>({ kind: 'invalid', field: 'cursor', reason })

export async function seal(
  options: CursorOptions,
  binding: CursorBinding,
  state: unknown,
): Promise<Outcome<string, SessionFailure>> {
  const payload = encoder.encode(
    JSON.stringify({ ...binding, expires: options.now() + options.ttlMs, state }),
  )
  const signed = await options.signing.sign(payload)
  if (signed.kind !== 'signed')
    return fail<SessionFailure>({
      kind: 'unavailable',
      owner: OWNER,
      diagnostic: 'the cursor signing key is unavailable',
    })
  const { keyId, signature } = signed.value
  return succeed(`${b64(payload)}.${b64(encoder.encode(keyId))}.${b64(signature)}`)
}

export async function open<T>(
  options: CursorOptions,
  binding: CursorBinding,
  token: string,
): Promise<Outcome<T, SessionFailure>> {
  const parts = token.split('.')
  if (parts.length !== 3) return invalid('malformed')
  const [body, key, signature] = parts as [string, string, string]
  const payload = unb64(body)
  const verdict = await options.signing.verify({
    payload,
    signature: { keyId: Buffer.from(unb64(key)).toString('utf8'), signature: unb64(signature) },
  })
  if (verdict.kind === 'unavailable')
    return fail<SessionFailure>({
      kind: 'unavailable',
      owner: OWNER,
      diagnostic: 'the cursor signing key is unavailable',
    })
  if (verdict.kind !== 'valid') return invalid('signature')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(Buffer.from(payload).toString('utf8')) as Record<string, unknown>
  } catch {
    return invalid('malformed')
  }
  if (
    parsed['kind'] !== binding.kind ||
    parsed['tenant'] !== binding.tenant ||
    parsed['session'] !== binding.session
  )
    return invalid('issued for another tenant, session or read')
  if (typeof parsed['expires'] !== 'number' || parsed['expires'] < options.now())
    return invalid('expired')
  return succeed(parsed['state'] as T)
}
