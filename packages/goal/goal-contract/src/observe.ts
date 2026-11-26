import {
  awaitedReading,
  cancelled,
  handed,
  pendingOf,
  received,
  sameKey,
  type Batch,
  type BatchKey,
  type Examination,
  type Handed,
} from './awaited.ts'
import type { CriterionId, GoalBody } from './body.ts'
import { gapTable, renderGap, type Reading, type Readings } from './gap.ts'
import type { Packed } from './judge/pack.ts'
import type { GoalRecord, Observed, Wake } from './record.ts'
import { arrive, transition, type Transition } from './transition.ts'
import { examined, verificationOf } from './verification.ts'
import { rule, type CriterionReading, type Findings } from './verdict.ts'

/** The goal, revision and round an observation began on, and where the last write of a file stood then. */
export type ObservedAt = Readonly<{
  generation: number
  revision: number
  rounds: number
  written: string
}>

const read = <V>(value: V, source: Reading<V>['source']): Reading<V> => ({
  value,
  source,
  ref: null,
})

/** The readings of one section with what was found written over them; an entry nothing was found of stays as it was. */
function readOver<K extends string, V>(
  before: Partial<Record<K, Reading<V>>>,
  found: Partial<Record<K, V>>,
  sourceOf: (id: K) => Reading<V>['source'],
): Partial<Record<K, Reading<V>>> {
  const fresh = (Object.entries(found) as [K, V | undefined][])
    .filter((entry): entry is [K, V] => entry[1] !== undefined)
    .map(([id, value]) => [id, read(value, sourceOf(id))] as const)
  return { ...before, ...Object.fromEntries(fresh) }
}

/** The readings after an observation: what the system settled is the system's, what was asked is the judge's, the rest stays. */
export function observedReadings(
  before: Readings,
  decided: Packed['decided'],
  findings: Findings,
): Readings {
  return {
    criteria: readOver(before.criteria, findings.criteria, id =>
      id in decided ? 'system' : 'judge',
    ),
    metrics: readOver(before.metrics, findings.metrics, () => 'system'),
    rules: readOver(before.rules, findings.rules, () => 'judge'),
  }
}

const waitingOf = (body: GoalBody): readonly GoalBody['criteria'][number][] =>
  body.criteria.filter(criterion => examined(verificationOf(criterion)))

export function withAwaited(
  body: GoalBody,
  examination: Examination,
  now: BatchKey,
  findings: Findings,
): Findings {
  const waits = waitingOf(body)
  if (waits.length === 0) return findings
  const read = waits.map(entry => [entry.id, awaitedReading(entry.id, examination, now)] as const)
  return {
    ...findings,
    criteria: { ...findings.criteria, ...Object.fromEntries(read) },
    pending: pendingOf(examination, now),
  }
}

function awaitedOver(
  body: GoalBody,
  readings: Readings,
  examination: Examination,
  now: BatchKey,
): Readings {
  const over = waitingOf(body).map(entry => {
    const kept = examination.read[entry.id]
    const value: CriterionReading = awaitedReading(entry.id, examination, now)
    const mine = kept !== undefined && sameKey(kept.key, now)
    const source = entry.evidence.kind === 'rerun' ? 'system' : 'examiner'
    const reading = { value, source, ref: null, note: mine ? kept.note : null } as const
    return [entry.id, reading] as const
  })
  return { ...readings, criteria: { ...readings.criteria, ...Object.fromEntries(over) } }
}

export function keptFindings(readings: Readings): Findings {
  const values = <V>(section: Readonly<Record<string, Reading<V> | undefined>>) =>
    Object.fromEntries(Object.entries(section).map(([id, entry]) => [id, entry?.value]))
  return {
    judge: 'answered',
    criteria: values(readings.criteria),
    metrics: values(readings.metrics),
    rules: values(readings.rules),
    exits: [],
    unattainable: false,
  } as Findings
}

type Batches = Readonly<{ handed: Batch | null; cancelled: Batch | null }>
export type ObservationStep =
  | Readonly<{ kind: 'next'; record: GoalRecord; answer: Observed['answer'] } & Batches>
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'reobserve' }>

const ANSWERS = [
  ['continue', 'continue'],
  ['tell-person', 'tell'],
  ['pass', 'pass'],
] as const

function answerOf(step: Extract<Transition, { kind: 'changed' }>): Observed['answer'] {
  const found = ANSWERS.find(([effect]) => step.effects.includes(effect))
  if (found === undefined) throw new Error('an observation that changed the goal has no answer')
  return found[1]
}

/** The identity of the reminder a round owes: the goal, the revision and the round it sends the agent on to. */
export function continueRequest(at: Omit<ObservedAt, 'written'>): string {
  return `continue/${String(at.generation)}/${String(at.revision)}/${String(at.rounds)}`
}

type Moved = Readonly<{ examination: Examination } & Batches>

function moved(
  examination: Examination,
  now: BatchKey,
  hand: readonly CriterionId[],
  settled: boolean,
): Moved {
  if (settled) {
    const back = cancelled(examination)
    return { examination: back.examination, handed: null, cancelled: back.cancelled }
  }
  if (hand.length === 0) return { examination, handed: null, cancelled: null }
  const out = handed(examination, now, hand)
  return { examination: out.examination, handed: out.examination.batch, cancelled: out.replaced }
}

const wakeOf = (answer: Observed['answer'], state: GoalRecord['state']): Wake | null =>
  answer === 'continue' ? { kind: 'continue', request: continueRequest(state) } : null

/** What one observation comes to: the verdict table over the findings, then the transition on the round it began on. `written`: where the last write stands now. */
export function observe(
  record: GoalRecord,
  input: Readonly<{
    call: string
    at: ObservedAt
    written: string
    decided: Packed['decided']
    findings: Findings
  }>,
): ObservationStep {
  const { state, body } = record
  if (state.status !== 'active') return { kind: 'pass' }
  const now: BatchKey = { revision: state.revision, written: input.written }
  const findings = withAwaited(body, record.examination, now, input.findings)
  const verdict = rule(body, { ...state, examinations: record.examination.used }, findings)
  const event = { kind: 'observe', at: input.at, written: input.written, verdict } as const
  const step = transition(state, event)
  if (step.kind !== 'changed') return { kind: 'reobserve' }
  const answer = answerOf(step)
  const hand = verdict.row === 2 ? verdict.hand : []
  const batches = moved(record.examination, now, hand, step.next.status === 'settled')
  const read = observedReadings(record.readings, input.decided, findings)
  return {
    kind: 'next',
    answer,
    handed: batches.handed,
    cancelled: batches.cancelled,
    record: {
      ...record,
      version: record.version + 1,
      state: step.next,
      readings: awaitedOver(body, read, batches.examination, now),
      examination: { ...batches.examination, arrived: false },
      wake: wakeOf(answer, step.next),
      observed: { call: input.call, answer },
    },
  }
}

export type EvidenceStep =
  | Readonly<{ kind: 'dropped' }>
  | Readonly<{ kind: 'next'; record: GoalRecord; told: 'continue' | 'tell' | null }>

const TOLD = [
  ['continue', 'continue'],
  ['tell-person', 'tell'],
] as const

type Ruled = Readonly<{ record: GoalRecord; told: 'continue' | 'tell' | null }>
type Live = Extract<GoalRecord['state'], { status: 'active' | 'paused' }>

function ruledOn(
  record: GoalRecord,
  state: Live,
  examination: Examination,
  how: Readonly<{ written: string; current: boolean; running: boolean }>,
): Ruled {
  const { body } = record
  const now: BatchKey = { revision: state.revision, written: how.written }
  const findings = withAwaited(body, examination, now, keptFindings(record.readings))
  const verdict = rule(body, { ...state, examinations: examination.used }, findings)
  const { current, running } = how
  const step = arrive(state, { kind: 'evidence', current, running, verdict })
  const next = step.kind === 'changed' ? step.next : state
  const told = TOLD.find(([effect]) => step.effects.includes(effect))?.[1] ?? null
  const hand = step.effects.includes('hand') && verdict.row === 2 ? verdict.hand : []
  const batches = moved(examination, now, hand, next.status === 'settled')
  const arrived = current && running && state.status === 'active'
  return {
    told,
    record: {
      ...record,
      version: record.version + 1,
      state: next,
      readings: awaitedOver(body, record.readings, batches.examination, now),
      examination: { ...batches.examination, arrived },
      wake: told === 'continue' ? wakeOf('continue', next) : record.wake,
    },
  }
}

export function evidence(
  record: GoalRecord,
  input: Readonly<{
    key: BatchKey
    written: string
    running: boolean
    answers: Readonly<Partial<Record<CriterionId, Handed>>> | null
    digest?: string
    unread?: readonly CriterionId[]
  }>,
): EvidenceStep {
  const { state } = record
  const got = received(record.examination, input.key, input.answers, input.unread)
  if (!got.taken || state.status === 'settled') return { kind: 'dropped' }
  const { written, running, digest } = input
  const current = sameKey(input.key, { revision: state.revision, written })
  const taken = current ? got.examination : { ...record.examination, batch: null }
  const submitted = digest === undefined ? taken.submitted : { key: input.key, digest }
  const how = { written, current, running }
  return { kind: 'next', ...ruledOn(record, state, { ...taken, submitted }, how) }
}

/** The verdict owed for readings that arrived while a round was going, given once no round is going. Null: nothing is owed now. */
export function settleArrived(
  record: GoalRecord,
  seen: Readonly<{ written: string; running: boolean }>,
): Ruled | null {
  const { state, examination } = record
  if (!examination.arrived || state.status !== 'active' || seen.running) return null
  return ruledOn(record, state, examination, { ...seen, current: true })
}

export function openGap(body: GoalBody, readings: Readings, rounds: number): string {
  return renderGap(gapTable(body, readings, rounds).filter(row => row.open))
}
