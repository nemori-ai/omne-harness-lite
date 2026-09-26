// EC v1 PublicHealthReply / HT1 v1 S-17；线上权威是冻结 Schema，不是这份 TS 投影。
export interface PublicHealthReply {
  readonly reachable: true
  readonly centerId: string
  readonly version: string
}

export type EntryAnswer =
  'version-mismatch' | 'login-state-rejected' | 'invalid-input' | 'unavailable'

export type HealthUnavailableReason =
  | 'connection'
  | 'trust'
  | 'timeout'
  | 'cancelled'
  | 'response-framing'
  | 'response-limit'
  | 'response-invalid'

export type PublicHealthOutcome =
  | { readonly kind: 'health'; readonly reply: PublicHealthReply }
  | { readonly kind: 'entry-answer'; readonly answer: EntryAnswer }
  | { readonly kind: 'unavailable'; readonly reason: HealthUnavailableReason }

export const PUBLIC_HEALTH_BODY = Buffer.from(
  '{"operation":"composition.governance-center-entry/v1#S-18"}',
)
const VERSION_MISMATCH = Buffer.from('"version-mismatch"')

/** 仅在 HTTP/1.1 成帧完成且未超限之后调用。 */
export function decodeHealthReply(body: Buffer, status: number | undefined): PublicHealthOutcome {
  if (body.equals(VERSION_MISMATCH)) return { kind: 'entry-answer', answer: 'version-mismatch' }
  if (status !== 200) return { kind: 'unavailable', reason: 'response-invalid' }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    return { kind: 'unavailable', reason: 'response-invalid' }
  }
  if (value === 'login-state-rejected' || value === 'invalid-input' || value === 'unavailable')
    return { kind: 'entry-answer', answer: value }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { kind: 'unavailable', reason: 'response-invalid' }
  if (
    Object.keys(value).length !== 3 ||
    !('reachable' in value) ||
    value.reachable !== true ||
    !('centerId' in value) ||
    typeof value.centerId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(value.centerId) ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    value.version.length === 0
  )
    return { kind: 'unavailable', reason: 'response-invalid' }
  return {
    kind: 'health',
    reply: { reachable: true, centerId: value.centerId, version: value.version },
  }
}
