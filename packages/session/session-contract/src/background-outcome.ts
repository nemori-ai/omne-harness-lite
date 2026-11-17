import type { Message } from '@omne-harness/message'
import type { BackgroundCallRecord, BackgroundCallStop } from './background-calls.ts'
import type { SessionEntry } from './entries.ts'
import { encodeEntry } from './entries.ts'
import type { HistoryEntry, SessionFailure } from './faces.ts'
import type { ConsumptionId, InputId } from './identity.ts'
import type { SessionEntriesInterpretation } from './interpretation-values.ts'
import type { EncodedEntry } from './judgments.ts'
import { digestOf } from './operations.ts'
import type {
  BackgroundDisposition,
  ControlProgress,
  ProducerRef,
  RoutedInput,
  WorkSnapshot,
} from './values.ts'
import { settledControls } from './call-control.ts'
import { equalValue } from './session-validation.ts'
import { stopReminderInput, stoppedText } from './stop-reminder.ts'
import { originOf, sourceOf } from './decision-support.ts'

/** The origin owner of an input that a background tool execution's outcome became. */
export const BACKGROUND_INPUT_OWNER = 'background-tool-execution'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
type Backgrounded = Extract<SessionEntriesInterpretation, { kind: 'backgrounded' }>
type Outcome = Extract<SessionEntriesInterpretation, { kind: 'background-outcome' }>

export type BackgroundOutcomeJudgment =
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'kept'; reason: Extract<BackgroundDisposition, { kind: 'kept' }>['reason'] }>
  | Readonly<{
      kind: 'input'
      destination: 'current-run' | 'next-run'
      stop: BackgroundCallStop | null
    }>

export type BackgroundStep =
  | Readonly<{
      kind: 'entries'
      entries: readonly EncodedEntry[]
      admitted: readonly Ordinary[]
      placeholders: readonly ConsumptionId[]
      controls: readonly ControlProgress[]
      /** The last short number given, this step's included. */
      ordinal?: number
    }>
  | Readonly<{ kind: 'rejected'; failure: SessionFailure }>

/** One result version of one call becomes at most this one input (SW-I13). */
export function backgroundInputId(producer: ProducerRef, result: string): InputId {
  return `bg_${digestOf({ kind: 'background-outcome', producer, result })}` as InputId
}

export function backgroundRecordOf(
  snapshot: WorkSnapshot,
  consumption: ConsumptionId,
): BackgroundCallRecord | null {
  if (!(snapshot.backgroundPlaceholders ?? []).includes(consumption)) return null
  return (snapshot.backgroundCalls ?? []).find(item => item.consumption === consumption) ?? null
}

// Only archiving revokes the outcome (SW-I14); a stopped call's outcome comes back, waking nobody.
export function judgeBackgroundOutcome(
  snapshot: WorkSnapshot,
  consumption: ConsumptionId,
): BackgroundOutcomeJudgment {
  if (!(snapshot.backgroundPlaceholders ?? []).includes(consumption)) return { kind: 'refused' }
  if (snapshot.lifecycle === 'archived') return { kind: 'kept', reason: 'archived' }
  const stop = backgroundRecordOf(snapshot, consumption)?.stop ?? null
  if (snapshot.run.kind === 'active') return { kind: 'input', destination: 'current-run', stop }
  if (snapshot.frozen !== null) return { kind: 'kept', reason: 'frozen' }
  return { kind: 'input', destination: 'next-run', stop }
}

const invalid = (field: string, reason: string): BackgroundStep => ({
  kind: 'rejected',
  failure: { kind: 'invalid', field, reason },
})

function consumptionOf(snapshot: WorkSnapshot, producer: ProducerRef): ConsumptionId | null {
  return snapshot.consumptions.find(item => equalValue(item.binding.producer, producer))?.id ?? null
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
  const ordinal = (snapshot.backgroundOrdinal ?? 0) + 1
  const { producer, label, how: source } = fact
  return {
    kind: 'entries',
    entries: [
      encodeEntry(
        { kind: 'call.backgrounded', consumption, producer, ordinal, label, source },
        origin,
      ),
    ],
    admitted: [],
    placeholders: [...placeholders, consumption],
    controls: snapshot.controls,
    ordinal,
  }
}

function reminderInput(fact: Outcome, stop: BackgroundCallStop | null): Ordinary {
  const { producer, result, reminder, source } = fact
  const message =
    stop === null
      ? reminder
      : ({ ...reminder, blocks: [...reminder.blocks, stoppedText(reminder.id, stop)] } as Message)
  return {
    kind: 'ordinary',
    input: backgroundInputId(producer, result),
    message,
    origin: {
      owner: BACKGROUND_INPUT_OWNER,
      record: producer.call,
      revision: result,
      digest: `sha256:${digestOf({ producer, result, source })}`,
    },
  }
}

function reminderEntries(
  snapshot: WorkSnapshot,
  input: Ordinary,
  wakes: boolean,
  origin: HistoryEntry['origin'],
): readonly EncodedEntry[] {
  const run = snapshot.run.kind === 'active' ? snapshot.run.run : null
  return [
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
        destination: run === null ? 'next-run' : 'current-run',
        run,
        origin: input.origin,
        ...(wakes || run !== null ? {} : { wakes: false as const }),
      },
      origin,
    ),
  ]
}

// A person's stop of a call in the background leaves one reminder; it never starts a Run itself.
export function stopReminderEntries(
  snapshot: WorkSnapshot,
  record: BackgroundCallRecord,
  stop: BackgroundCallStop,
): Readonly<{ entries: readonly EncodedEntry[]; input: Ordinary }> {
  const input = stopReminderInput(record, stop)
  const origin = originOf(sourceOf(stop.operation, 'control'))
  return { entries: reminderEntries(snapshot, input, false, origin), input }
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
  const judged = judgeBackgroundOutcome(snapshot, consumption)
  if (judged.kind === 'refused') return invalid('producer', 'the call is not backgrounded')
  const placeholders = (snapshot.backgroundPlaceholders ?? []).filter(item => item !== consumption)
  const released = settledControls(snapshot.controls, fact.producer)
  const controls = snapshot.controls.map(
    control => released.find(item => item.operation === control.operation) ?? control,
  )
  const settled = (disposition: BackgroundDisposition) => [
    encodeEntry(
      { kind: 'call.background-settled', consumption, result: fact.result, disposition },
      origin,
    ),
    ...released.map(progress =>
      encodeEntry({ kind: 'control.progress', progress, fact: null }, origin),
    ),
  ]
  if (judged.kind === 'kept')
    return {
      kind: 'entries',
      entries: settled({ kind: 'kept', reason: judged.reason }),
      admitted: [],
      placeholders,
      controls,
    }
  const input = reminderInput(fact, judged.stop)
  return {
    kind: 'entries',
    entries: [
      ...settled({ kind: 'input', input: input.input }),
      ...reminderEntries(snapshot, input, judged.stop === null, origin),
    ],
    admitted: [input],
    placeholders,
    controls,
  }
}

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
  if (bound === undefined || !equalValue(bound.binding.producer, entry.producer))
    return 'a placeholder of a call that is not bound to the consumption'
  const placeholders = draft.backgroundPlaceholders ?? []
  if (placeholders.includes(entry.consumption)) return 'a call backgrounded twice'
  if (bound.binding.producer.kind !== 'tool') return 'a placeholder of a call that is not a tool'
  draft.backgroundPlaceholders = [...placeholders, entry.consumption]
  const { consumption, ordinal, label, source } = entry
  const record = { consumption, producer: bound.binding.producer, ordinal, label, source }
  draft.backgroundCalls = [...(draft.backgroundCalls ?? []), record]
  draft.backgroundOrdinal = Math.max(draft.backgroundOrdinal ?? 0, ordinal)
  return null
}

export function applyBackgroundStop(draft: Draft, progress: ControlProgress): void {
  const { intent } = progress
  if (intent.kind !== 'control' || intent.value.kind !== 'stop-call') return
  const { producer, initiator, reason } = intent.value
  draft.backgroundCalls = (draft.backgroundCalls ?? []).map(item =>
    item.stop === undefined && equalValue(item.producer, producer)
      ? {
          ...item,
          stop: {
            initiator: initiator ?? 'user',
            reason: reason ?? null,
            operation: progress.operation,
          },
        }
      : item,
  )
}

export function applyBackgroundSettled(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'call.background-settled' }>,
): string | null {
  const placeholders = draft.backgroundPlaceholders ?? []
  if (!placeholders.includes(entry.consumption)) return 'a settlement of a call not in background'
  draft.backgroundPlaceholders = placeholders.filter(item => item !== entry.consumption)
  const settled = entry.disposition.kind
  draft.backgroundCalls = (draft.backgroundCalls ?? []).map(item =>
    item.consumption === entry.consumption ? { ...item, settled } : item,
  )
  if (entry.disposition.kind === 'input')
    draft.backgroundInputs = [...(draft.backgroundInputs ?? []), entry.disposition.input]
  return null
}

/**
 * What an input was accepted as stays with it while it lives: pending, or taken with its bracket
 * still open. A failed Run gives such an input back as it was.
 */
export function pruneInputLists(draft: Draft): void {
  const alive = new Set([...draft.pending, ...(draft.unanswered ?? [])])
  if (draft.backgroundInputs !== undefined)
    draft.backgroundInputs = draft.backgroundInputs.filter(input => alive.has(input))
  if (draft.quietInputs !== undefined)
    draft.quietInputs = draft.quietInputs.filter(input => alive.has(input))
}
