import type { SessionEntry } from './entries.ts'
import { encodeEntry } from './entries.ts'
import type { HistoryEntry, SessionFailure } from './faces.ts'
import type { ConsumptionId, InputId } from './identity.ts'
import type { SessionEntriesInterpretation } from './interpretation-values.ts'
import type { EncodedEntry } from './judgments.ts'
import { digestOf } from './operations.ts'
import type { BackgroundDisposition, ProducerRef, RoutedInput, WorkSnapshot } from './values.ts'

/** The origin owner of an input that a background tool execution's outcome became. */
export const BACKGROUND_INPUT_OWNER = 'background-tool-execution'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
type Backgrounded = Extract<SessionEntriesInterpretation, { kind: 'backgrounded' }>
type Outcome = Extract<SessionEntriesInterpretation, { kind: 'background-outcome' }>

export type BackgroundOutcomeJudgment =
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'kept'; reason: Extract<BackgroundDisposition, { kind: 'kept' }>['reason'] }>
  | Readonly<{ kind: 'input'; destination: 'current-run' | 'next-run' }>

export type BackgroundStep =
  | Readonly<{
      kind: 'entries'
      entries: readonly EncodedEntry[]
      admitted: readonly Ordinary[]
      placeholders: readonly ConsumptionId[]
    }>
  | Readonly<{ kind: 'rejected'; failure: SessionFailure }>

/** One result version of one call becomes at most this one input (SW-I13). */
export function backgroundInputId(producer: ProducerRef, result: string): InputId {
  return `bg_${digestOf({ kind: 'background-outcome', producer, result })}` as InputId
}

const sameProducer = (left: ProducerRef, right: ProducerRef): boolean =>
  left.kind === right.kind && left.call === right.call

function stoppedAlone(snapshot: WorkSnapshot, producer: ProducerRef): boolean {
  return snapshot.controls.some(
    control =>
      control.intent.kind === 'control' &&
      control.intent.value.kind === 'stop-call' &&
      sameProducer(control.intent.value.producer, producer),
  )
}

/**
 * Whether the outcome of a backgrounded call becomes an input (SW-I14). The eligibility is
 * derived from the snapshot: archiving the session or stopping this one call revokes it;
 * cancelling the Run does not. Rows are tried in order.
 */
export function judgeBackgroundOutcome(
  snapshot: WorkSnapshot,
  consumption: ConsumptionId,
  producer: ProducerRef,
): BackgroundOutcomeJudgment {
  if (!(snapshot.backgroundPlaceholders ?? []).includes(consumption)) return { kind: 'refused' }
  if (snapshot.lifecycle === 'archived') return { kind: 'kept', reason: 'archived' }
  if (stoppedAlone(snapshot, producer)) return { kind: 'kept', reason: 'stopped' }
  if (snapshot.run.kind === 'active') return { kind: 'input', destination: 'current-run' }
  if (snapshot.frozen !== null) return { kind: 'kept', reason: 'frozen' }
  return { kind: 'input', destination: 'next-run' }
}

const invalid = (field: string, reason: string): BackgroundStep => ({
  kind: 'rejected',
  failure: { kind: 'invalid', field, reason },
})

function consumptionOf(snapshot: WorkSnapshot, producer: ProducerRef): ConsumptionId | null {
  return (
    snapshot.consumptions.find(item => sameProducer(item.binding.producer, producer))?.id ?? null
  )
}

function decideBackgrounded(
  snapshot: WorkSnapshot,
  fact: Backgrounded,
  origin: HistoryEntry['origin'],
): BackgroundStep {
  const consumption = consumptionOf(snapshot, fact.producer)
  if (consumption === null) return invalid('producer', 'no original binding')
  const placeholders = snapshot.backgroundPlaceholders ?? []
  if (placeholders.includes(consumption))
    return invalid('producer', 'the call is already backgrounded')
  return {
    kind: 'entries',
    entries: [
      encodeEntry({ kind: 'call.backgrounded', consumption, producer: fact.producer }, origin),
    ],
    admitted: [],
    placeholders: [...placeholders, consumption],
  }
}

function reminderInput(fact: Outcome): Ordinary {
  const { producer, result, reminder, source } = fact
  return {
    kind: 'ordinary',
    input: backgroundInputId(producer, result),
    message: reminder,
    origin: {
      owner: BACKGROUND_INPUT_OWNER,
      record: producer.call,
      revision: result,
      digest: `sha256:${digestOf({ producer, result, source })}`,
    },
  }
}

function decideOutcome(
  snapshot: WorkSnapshot,
  fact: Outcome,
  origin: HistoryEntry['origin'],
): BackgroundStep {
  const consumption = consumptionOf(snapshot, fact.producer)
  if (consumption === null) return invalid('producer', 'no original binding')
  if (fact.result.length === 0) return invalid('result', 'empty')
  if (fact.reminder.role !== 'system_reminder' || fact.reminder.blocks.length === 0)
    return invalid('reminder', 'not a system reminder with content')
  const judged = judgeBackgroundOutcome(snapshot, consumption, fact.producer)
  if (judged.kind === 'refused') return invalid('producer', 'the call is not backgrounded')
  const placeholders = (snapshot.backgroundPlaceholders ?? []).filter(item => item !== consumption)
  const settled = (disposition: BackgroundDisposition) =>
    encodeEntry(
      { kind: 'call.background-settled', consumption, result: fact.result, disposition },
      origin,
    )
  if (judged.kind === 'kept')
    return {
      kind: 'entries',
      entries: [settled({ kind: 'kept', reason: judged.reason })],
      admitted: [],
      placeholders,
    }
  const input = reminderInput(fact)
  if (snapshot.pending.includes(input.input))
    return invalid('result', 'the outcome of this result version was already accepted')
  const run = snapshot.run.kind === 'active' ? snapshot.run.run : null
  return {
    kind: 'entries',
    entries: [
      settled({ kind: 'input', input: input.input }),
      encodeEntry(
        {
          kind: 'message.system_reminder',
          message: input.message,
          source: input.origin,
          admission: null,
          consumption: null,
          participation: null,
        },
        origin,
      ),
      encodeEntry(
        {
          kind: 'intake.routed',
          input: input.input,
          destination: judged.destination,
          run,
          origin: input.origin,
        },
        origin,
      ),
    ],
    admitted: [input],
    placeholders,
  }
}

/** Decides the consequence of one background interpretation within an entries batch. */
export function decideBackground(
  snapshot: WorkSnapshot,
  fact: Backgrounded | Outcome,
  origin: HistoryEntry['origin'],
): BackgroundStep {
  return fact.kind === 'backgrounded'
    ? decideBackgrounded(snapshot, fact, origin)
    : decideOutcome(snapshot, fact, origin)
}

export function applyBackgrounded(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'call.backgrounded' }>,
): string | null {
  const bound = draft.consumptions.find(item => item.id === entry.consumption)
  if (bound === undefined || !sameProducer(bound.binding.producer, entry.producer))
    return 'a placeholder of a call that is not bound to the consumption'
  const placeholders = draft.backgroundPlaceholders ?? []
  if (placeholders.includes(entry.consumption)) return 'a call backgrounded twice'
  draft.backgroundPlaceholders = [...placeholders, entry.consumption]
  return null
}

export function applyBackgroundSettled(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'call.background-settled' }>,
): string | null {
  const placeholders = draft.backgroundPlaceholders ?? []
  if (!placeholders.includes(entry.consumption)) return 'a settlement of a call not in background'
  draft.backgroundPlaceholders = placeholders.filter(item => item !== entry.consumption)
  if (entry.disposition.kind === 'input')
    draft.backgroundInputs = [...(draft.backgroundInputs ?? []), entry.disposition.input]
  return null
}

/** Background inputs leave the list once they leave the pending inputs. */
export function pruneBackgroundInputs(draft: Draft): void {
  if (draft.backgroundInputs !== undefined)
    draft.backgroundInputs = draft.backgroundInputs.filter(input => draft.pending.includes(input))
}
