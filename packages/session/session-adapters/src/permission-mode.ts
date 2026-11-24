import { createHash } from 'node:crypto'
import type { InquiryPolicy } from '@omne-harness/authorization'
import type {
  Adoption,
  Attendance,
  DurableEvidence,
  Modes,
  SessionCreation,
} from '@omne-harness/session-contract'

const attended = {
  never: Object.freeze({ onAsk: 'deny' }),
  auto_permission: Object.freeze({ onAsk: 'ask-human' }),
  'bypass-permissions': Object.freeze({ onAsk: 'skip-ask' }),
} as const satisfies Readonly<Record<Modes['permission'], InquiryPolicy>>

// Where nobody attends, an action a person would have to decide is refused: not let through, not awaited.
const policies = {
  attended,
  unattended: {
    ...attended,
    auto_permission: Object.freeze({ onAsk: 'deny', denial: 'nobody-to-ask' }),
  },
} as const satisfies Readonly<
  Record<Attendance, Readonly<Record<Modes['permission'], InquiryPolicy>>>
>

export const SESSION_PERMISSION_MODE_TRANSLATION: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'permission-mode',
  revision: '2',
  digest: `sha256:${createHash('sha256').update(JSON.stringify(policies)).digest('hex')}`,
})

export type DefaultPermissionMode =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'available'
      adoption: Adoption
      value: Modes['permission']
      source: DurableEvidence
    }>

export type SessionPermissionModeInput = Readonly<{
  adopted: SessionCreation['modes']
  creationSource: DurableEvidence
  override: Readonly<{ value: Modes['permission']; source: DurableEvidence }> | null
  defaultMode: DefaultPermissionMode
  attendance: Attendance
}>

export type SessionPermissionModeProjection = Readonly<{
  policy: InquiryPolicy
  source: DurableEvidence
  translation: Adoption
}>

export type SessionPermissionModeResult =
  | Readonly<{ kind: 'projected'; value: SessionPermissionModeProjection }>
  | Readonly<{ kind: 'unavailable'; reason: 'default-mode-missing' | 'default-mode-mismatch' }>

function projected(
  attendance: Attendance,
  value: Modes['permission'],
  source: DurableEvidence,
): SessionPermissionModeResult {
  return Object.freeze({
    kind: 'projected',
    value: Object.freeze({
      policy: policies[attendance][value],
      source: Object.freeze({ ...source }),
      translation: SESSION_PERMISSION_MODE_TRANSLATION,
    }),
  })
}

export function projectSessionPermissionMode(
  input: SessionPermissionModeInput,
): SessionPermissionModeResult {
  const { attendance } = input
  if (input.override !== null)
    return projected(attendance, input.override.value, input.override.source)
  if (input.adopted.kind === 'explicit')
    return projected(attendance, input.adopted.value.permission, input.creationSource)
  const observed = input.defaultMode
  if (observed.kind === 'unavailable')
    return { kind: 'unavailable', reason: 'default-mode-missing' }
  const expected = input.adopted.source
  const actual = observed.adoption
  if (
    expected.owner !== actual.owner ||
    expected.name !== actual.name ||
    expected.revision !== actual.revision ||
    expected.digest !== actual.digest
  )
    return { kind: 'unavailable', reason: 'default-mode-mismatch' }
  return projected(attendance, observed.value, observed.source)
}
