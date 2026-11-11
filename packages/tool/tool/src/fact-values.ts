import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { FactBatch, ToolCanonicalFingerprint } from '@omne-harness/tool-contract/provider'
import { encodeToolCanonical } from './canonical-codec.ts'
import type { StoredExecutionFact } from './ledger-store.ts'

export type FactValues = Readonly<{
  batch: ToolCanonicalFingerprint
  events: readonly Readonly<{ event: string; value: ToolCanonicalFingerprint }>[]
}>
export type StoredFactBatch = Omit<FactBatch, 'events'> &
  Readonly<{
    value: ToolCanonicalFingerprint
    events: readonly Readonly<{
      event: string
      fact: StoredExecutionFact
      value: ToolCanonicalFingerprint
    }>[]
  }>

export function factValues(batch: FactBatch): Outcome<FactValues, ToolFailure> {
  const seen = new Map<string, ToolCanonicalFingerprint>()
  const events: { event: string; value: ToolCanonicalFingerprint }[] = []
  for (const event of batch.events) {
    const value = encodeToolCanonical(event.fact)
    if ('failure' in value) return value
    const previous = seen.get(event.event)
    if (
      previous !== undefined &&
      (previous.digest !== value.ok.fingerprint.digest ||
        previous.bytes !== value.ok.fingerprint.bytes)
    )
      return fail({ kind: 'invalid', field: 'batch.events', reason: 'event-conflict' })
    seen.set(event.event, value.ok.fingerprint)
    events.push({ event: event.event, value: value.ok.fingerprint })
  }
  const value = encodeToolCanonical({ ...batch, events })
  if ('failure' in value) return value
  return succeed({ batch: value.ok.fingerprint, events })
}

export function matchesFinalValue(value: ToolCanonicalFingerprint, final: unknown): boolean {
  const encoded = encodeToolCanonical(final)
  return (
    'ok' in encoded &&
    encoded.ok.fingerprint.codec === value.codec &&
    encoded.ok.fingerprint.algorithm === value.algorithm &&
    encoded.ok.fingerprint.digest === value.digest &&
    encoded.ok.fingerprint.bytes === value.bytes
  )
}
