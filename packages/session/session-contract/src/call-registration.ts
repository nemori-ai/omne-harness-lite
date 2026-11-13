// The one reading of a `call.bound` payload (SPEC「稳定调用引用的读取」). The log stores two shapes:
// an in-run registration keeps the reference and the purpose inside `registration`, an out-of-run
// one (`bindExternalCall`) keeps them at the top. The encoder adds the top-level `kind` to both.
import type { JsonValue } from '@omne-harness/json-text'

export type CallRegistrationView = Readonly<{
  kind: 'model' | 'tool'
  /** Null for a tool registration that is not associated yet. */
  reference: string | null
  purpose: 'main' | 'compaction' | 'extension' | 'action'
}>

const PURPOSES = {
  model: new Set(['main', 'compaction', 'extension']),
  tool: new Set(['action']),
} as const

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function text(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

/** Kind, reference and purpose of a `call.bound` payload in either stored shape; null when it is none. */
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
