import type { JsonValue } from '@omne-harness/json-text'
import { member, text } from './payload-members.ts'

export type CallRegistrationView = Readonly<{
  kind: 'model' | 'tool'
  reference: string | null
  purpose: 'main' | 'compaction' | 'extension' | 'action'
}>

const PURPOSES = {
  model: new Set(['main', 'compaction', 'extension']),
  tool: new Set(['action']),
} as const

export function readCallRegistration(payload: JsonValue): CallRegistrationView | null {
  const kind = text(member(payload, 'kind'))
  if (kind !== 'model' && kind !== 'tool') return null
  const registration = member(payload, 'registration')
  const held = registration ?? payload
  const purpose = text(member(held, 'purpose'))
  if (purpose === undefined || !PURPOSES[kind].has(purpose)) return null
  const reference =
    registration === undefined
      ? text(member(payload, 'reference'))
      : text(member(member(member(registration, 'binding'), 'producer'), 'call'))
  return { kind, reference: reference ?? null, purpose: purpose as CallRegistrationView['purpose'] }
}
