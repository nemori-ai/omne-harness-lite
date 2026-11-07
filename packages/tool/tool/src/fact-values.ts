import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { FactBatch, ToolMaterialFingerprint } from '@omne-harness/tool-contract/provider'
import { encodeToolMaterial } from './material-codec.ts'
import type { StoredExecutionFact } from './ledger-store.ts'

export type FactValues = Readonly<{
  batch: ToolMaterialFingerprint
  events: readonly Readonly<{ event: string; value: ToolMaterialFingerprint }>[]
}>
export type StoredFactBatch = Omit<FactBatch, 'events'> &
  Readonly<{
    value: ToolMaterialFingerprint
    events: readonly Readonly<{
      event: string
      fact: StoredExecutionFact
      value: ToolMaterialFingerprint
    }>[]
  }>

export function factValues(batch: FactBatch): Outcome<FactValues, ToolFailure> {
  const seen = new Map<string, ToolMaterialFingerprint>()
  const events: { event: string; value: ToolMaterialFingerprint }[] = []
  for (const event of batch.events) {
    const value =
      event.fact.kind === 'final'
        ? succeed({ fingerprint: event.fact.value })
        : encodeToolMaterial(event.fact)
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
  const value = encodeToolMaterial({ ...batch, events })
  if ('failure' in value) return value
  return succeed({ batch: value.ok.fingerprint, events })
}

export function matchesFinalValue(value: ToolMaterialFingerprint, final: unknown): boolean {
  const encoded = encodeToolMaterial(final)
  return (
    'ok' in encoded &&
    encoded.ok.fingerprint.codec === value.codec &&
    encoded.ok.fingerprint.algorithm === value.algorithm &&
    encoded.ok.fingerprint.digest === value.digest &&
    encoded.ok.fingerprint.bytes === value.bytes
  )
}
