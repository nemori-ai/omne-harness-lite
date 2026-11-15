import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import type { SessionFailure } from '@omne-harness/session-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const OWNER = '@omne-harness/session-storage-sql'

export type CursorBinding = Readonly<{
  kind: string
  tenant: string | null
  session: string | null
  revision?: string
  key?: string
}>
export type CursorOptions = Readonly<{
  signing: SessionCursorSigning
  now: () => number
  ttlMs: number
}>

const encoder = new TextEncoder()

const DOMAIN = encoder.encode('omne-harness/session-storage-sql/cursor/v1\u0000')
const signed = (payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(DOMAIN.length + payload.length)
  out.set(DOMAIN, 0)
  out.set(payload, DOMAIN.length)
  return out
}
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
  const sealed = await options.signing.sign(signed(payload))
  if (sealed.kind !== 'signed')
    return fail<SessionFailure>({
      kind: 'unavailable',
      owner: OWNER,
      diagnostic: 'the cursor signing key is unavailable',
    })
  const { keyId, signature } = sealed.value
  return succeed(`${b64(payload)}.${b64(encoder.encode(keyId))}.${b64(signature)}`)
}

function bindingMismatch(parsed: Record<string, unknown>, binding: CursorBinding): string | null {
  if (
    parsed['kind'] !== binding.kind ||
    parsed['tenant'] !== binding.tenant ||
    parsed['session'] !== binding.session
  )
    return 'issued for another tenant, session or read'
  if ((parsed['revision'] ?? null) !== (binding.revision ?? null))
    return 'issued under another tenant domain directory revision'
  if ((parsed['key'] ?? null) !== (binding.key ?? null)) return 'issued for another key'
  return null
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
    payload: signed(payload),
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
  const mismatch = bindingMismatch(parsed, binding)
  if (mismatch !== null) return invalid(mismatch)
  if (typeof parsed['expires'] !== 'number' || parsed['expires'] < options.now())
    return invalid('expired')
  return succeed(parsed['state'] as T)
}
