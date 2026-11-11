// The continuation cursor of read-session-diagnostics (SPEC「会话诊断投影」). A cursor seals the
// scan position with the tenant, the session, the Run filter, the page size and the Session upper
// bound it was issued under. The key is random per entry instance, so a cursor cannot be forged or
// altered, and one issued by another instance is `invalid`, never continued at a guessed position.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type DiagnosticsCursorBinding = Readonly<{ tenant: string; session: string }>
export type DiagnosticsCursorState = Readonly<{
  /** The entry the next page starts before (Session `begin` with `from`, backward). */
  from: string
  run: string | null
  pageBytes: number
  upper: string
}>

export interface DiagnosticsCursors {
  seal(binding: DiagnosticsCursorBinding, state: DiagnosticsCursorState): string
  /** The state of a cursor this instance sealed for `binding`; undefined for any other text. */
  open(binding: DiagnosticsCursorBinding, cursor: string): DiagnosticsCursorState | undefined
}

const DOMAIN = 'omne-harness/server-entry/session-diagnostics-cursor/v1\u0000'

function macOf(key: Uint8Array, payload: string): Buffer {
  return createHmac('sha256', key).update(DOMAIN).update(payload).digest()
}

type Payload = Record<string, unknown>

function payloadOf(value: unknown, binding: DiagnosticsCursorBinding): Payload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const parsed = value as Payload
  const bound = parsed['tenant'] === binding.tenant && parsed['session'] === binding.session
  return bound ? parsed : undefined
}

function wellFormed(parsed: Payload): parsed is Payload & DiagnosticsCursorState {
  const { from, run, pageBytes, upper } = parsed
  const texts = typeof from === 'string' && typeof upper === 'string'
  const filter = run === null || typeof run === 'string'
  const size = typeof pageBytes === 'number' && Number.isSafeInteger(pageBytes) && pageBytes >= 1
  return texts && filter && size
}

function stateOf(
  value: unknown,
  binding: DiagnosticsCursorBinding,
): DiagnosticsCursorState | undefined {
  const parsed = payloadOf(value, binding)
  if (parsed === undefined || !wellFormed(parsed)) return undefined
  const { from, run, pageBytes, upper } = parsed
  return { from, run, pageBytes, upper }
}

export function createDiagnosticsCursors(key: Uint8Array = randomBytes(32)): DiagnosticsCursors {
  return {
    seal(binding, state) {
      const payload = Buffer.from(JSON.stringify({ ...binding, ...state }), 'utf8')
      const text = payload.toString('base64url')
      return `${text}.${macOf(key, text).toString('base64url')}`
    },
    open(binding, cursor) {
      const parts = cursor.split('.')
      if (parts.length !== 2) return undefined
      const [text, mac] = parts as [string, string]
      const given = Buffer.from(mac, 'base64url')
      const expected = macOf(key, text)
      if (given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected))
        return undefined
      try {
        return stateOf(JSON.parse(Buffer.from(text, 'base64url').toString('utf8')), binding)
      } catch {
        return undefined
      }
    },
  }
}
