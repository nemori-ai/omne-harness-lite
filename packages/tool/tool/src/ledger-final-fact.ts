// The final fact of a call: the planned final the execution recorded (model `CommitResult`
// consumes it, nothing reads a body back). Receipt checks that an offloaded original names a
// sealed body entry of this call; recovery hands the stored plan back, or the settlement receipt.
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { FactBatch, ToolPlannedFinal } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { sameFactValue } from './evidence.ts'
import type { FactValues, StoredFactBatch } from './fact-values.ts'
import { entryBySource } from './ledger-body-entries.ts'
import type { Snapshot } from './ledger-decider.ts'
import {
  factKey,
  type FactEventRecord,
  type SavedFact,
  type StoredExecutionFact,
} from './ledger-store.ts'

type StoredSavedFact = Pick<FactEventRecord, 'start' | 'source' | 'event' | 'fact' | 'evidence'>

/**
 * The batch as the ledger stores it: each event with its fingerprint, a planned final as a pending
 * fact. The first final of a call may name only a body this call sealed; a final the call already
 * knows is adopted as that known final (`planEvents` fixes the value and refuses a conflicting one).
 */
export function adoptFinalFact(
  snapshot: Snapshot,
  batch: FactBatch,
  values: FactValues,
): Outcome<StoredFactBatch, ToolFailure> {
  const valueByEvent = new Map(values.events.map(event => [event.event, event.value]))
  const known = [...snapshot.facts.values()].find(
    record => record.start.operation === batch.start.operation && record.fact.kind === 'final',
  )
  const events: StoredFactBatch['events'][number][] = []
  for (const event of batch.events) {
    const value = valueByEvent.get(event.event)
    if (value === undefined) return invalid('batch.events', 'missing-fingerprint')
    const saved = snapshot.facts.get(factKey(batch.start, batch.source.owner, event.event))
    if (saved !== undefined && !sameFactValue(saved.value, value))
      return invalid('batch.events', 'event-conflict')
    const fact =
      event.fact.kind === 'final' ? adoptedFinal(snapshot, event.fact, known) : succeed(event.fact)
    if ('failure' in fact) return fact
    events.push({ event: event.event, fact: fact.ok, value })
  }
  return succeed({ ...batch, value: values.batch, events })
}

function adoptedFinal(
  snapshot: Snapshot,
  final: ToolPlannedFinal,
  known: FactEventRecord | undefined,
): Outcome<StoredExecutionFact, ToolFailure> {
  if (known?.fact.kind === 'final') return succeed(known.fact)
  const original = final.result.original
  if (original.kind === 'offloaded') {
    const entry = entryBySource(snapshot, original.source)
    if (entry === null || (entry.state.kind !== 'sealed' && entry.state.kind !== 'linked'))
      return invalid('batch.events.fact', 'unowned-final-body')
  }
  return succeed(planned(final))
}

function planned(final: ToolPlannedFinal): StoredExecutionFact {
  return { ...final, payload: { kind: 'pending' } }
}

/** The saved final as recovery returns it: the pending plan, or its settlement receipt. */
export function restoreSavedFact<B extends ContentBlock>(saved: StoredSavedFact): SavedFact<B> {
  if (saved.fact.kind !== 'final') return { ...saved, fact: saved.fact }
  const { payload, ...final } = saved.fact
  if (payload.kind === 'settled')
    return {
      ...saved,
      fact: {
        kind: 'settled-final',
        terminal: final.terminal,
        effect: final.effect,
        result: payload.result,
        settlement: payload.settlement,
      },
    }
  return { ...saved, fact: final as SavedFact<B>['fact'] }
}
