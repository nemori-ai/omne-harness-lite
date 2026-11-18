import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { SessionFailure } from './faces.ts'
import type { Decision, EncodedEntry, OperationRecord } from './judgments.ts'
import type {
  SessionEntriesObservation,
  SessionEntriesProgress,
  SessionEntriesStart,
} from './interpretation-values.ts'
import type { RoutedInput, WorkSnapshot } from './values.ts'
import { encodeEntry } from './entries.ts'
import { decideProducerFact } from './decide-receive.ts'
import { decideBackground } from './background-outcome.ts'
import type { DerivedAdmission, IntakeTerms } from './input-sources.ts'
import { digestOf } from './operations.ts'
import {
  SessionValidationFailure,
  decimal,
  equalValue,
  evidenceFields,
  invalidAt,
  nonempty,
  unavailableAt,
} from './session-validation.ts'

export const SAME_LOG_ENTRIES_VIA = 'same-log-entries'

type EntriesDecision = Exclude<Decision, { kind: 'control-answer' }>
type ChannelKey = Pick<SessionEntriesProgress, 'run' | 'execution' | 'channel'>

const refuse = (failure: SessionFailure): EntriesDecision => ({ kind: 'rejected', failure })

export function digestSessionEntries(observation: SessionEntriesObservation): string {
  const { operation: _operation, tenant, ...rest } = observation
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    throw new TypeError('the tenant of the observation was not minted by legal-identity')
  return digestOf({ kind: 'entries', input: { ...rest, tenant: text.value } })
}

export function projectSessionEntries(
  snapshot: WorkSnapshot,
  input: Readonly<{
    observation: SessionEntriesObservation
    start: SessionEntriesStart
    saved: readonly SessionEntriesProgress[]
    record: OperationRecord | null
    /** The writer's terms for the inputs this batch derives; not part of the request identity. */
    derived?: IntakeTerms['derived']
  }>,
): EntriesDecision {
  const { observation, start, saved, record } = input
  if (
    !tenantEquals(snapshot.tenant, observation.tenant) ||
    snapshot.session !== observation.session
  )
    return refuse({ kind: 'denied', action: 'commitEntries' })
  try {
    nonempty(observation.operation, 'operation')
    if (record !== null)
      return record.operation === observation.operation &&
        record.digest === digestSessionEntries(observation)
        ? { kind: 'recovered', receipt: record.receipt }
        : refuse({ kind: 'conflict', operation: observation.operation })
    checkForm(observation)
    checkBinding(snapshot, observation)
    checkRange(observation)
    checkStart(snapshot, observation, start, saved)
    checkItems(observation)
    return interpret(snapshot, observation, input.derived?.['background-outcome'])
  } catch (error) {
    if (error instanceof SessionValidationFailure) return refuse(error.failure)
    if (error instanceof TypeError || error instanceof RangeError)
      return refuse({ kind: 'invalid', field: 'observation', reason: error.message })
    throw error
  }
}

function checkForm(observation: SessionEntriesObservation): void {
  decimal(observation.after, 'after')
  decimal(observation.through, 'through')
  nonempty(observation.position, 'position')
  decimal(observation.boundary.count, 'boundary.count')
  decimal(observation.boundary.revision, 'boundary.revision')
  observation.items.forEach((item, at) => {
    const field = `items[${at}].ordinal`
    if (decimal(item.ordinal, field) === 0n) invalidAt(field, 'expected canonical positive decimal')
  })
  evidenceFields(observation.boundary.executionEvidence, 'boundary.executionEvidence')
  observation.items.forEach((item, at) => {
    evidenceFields(item.fact, `items[${at}].fact`)
    item.interpretation.forEach((part, index) => {
      if (part.kind !== 'observed')
        evidenceFields(part.source, `items[${at}].interpretation[${index}].source`)
    })
  })
}

function checkBinding(snapshot: WorkSnapshot, observation: SessionEntriesObservation): void {
  const current =
    snapshot.run.kind === 'active'
      ? [{ run: snapshot.run.run, execution: snapshot.run.execution.execution }]
      : []
  const owners = [
    ...(snapshot.executions ?? []).map(item => ({
      run: item.run,
      execution: item.execution.execution,
    })),
    ...current,
  ].filter(owner => owner.execution === observation.execution)
  if (owners.length === 0) unavailableAt('execution')
  if (!owners.some(owner => owner.run === observation.run))
    invalidAt('run', 'the execution belongs to another Run')
  if (observation.boundary.execution !== observation.execution)
    invalidAt('boundary.execution', 'not the execution of the observation')
  if (observation.boundary.channel !== observation.channel)
    invalidAt('boundary.channel', 'not the channel of the observation')
}

function checkRange(observation: SessionEntriesObservation): void {
  const through = BigInt(observation.through)
  if (through <= BigInt(observation.after))
    invalidAt('through', 'the range (after, through] is empty or inverted')
  if (through > BigInt(observation.boundary.count))
    invalidAt('through', 'passes the entry count of the channel')
}

function checkStart(
  snapshot: WorkSnapshot,
  observation: SessionEntriesObservation,
  start: SessionEntriesStart,
  saved: readonly SessionEntriesProgress[],
): void {
  const sameChannel = (key: ChannelKey) =>
    key.run === observation.run &&
    key.execution === observation.execution &&
    key.channel === observation.channel
  const current = saved.find(sameChannel) ?? null
  if (observation.after !== (start.kind === 'initial' ? '0' : start.progress.through))
    invalidAt('after', 'does not agree with the start')
  if (start.kind === 'initial') {
    if (current !== null)
      throw new SessionValidationFailure({ kind: 'changed', revision: snapshot.revision })
    return
  }
  if (current === null) invalidAt('start', 'no progress is saved for the channel')
  if (!sameChannel(start.progress)) invalidAt('start', 'names another channel')
  if (BigInt(start.progress.through) < decimal(current.through, 'saved.through'))
    throw new SessionValidationFailure({ kind: 'changed', revision: snapshot.revision })
  if (!equalValue(start.progress, current))
    invalidAt('start', 'is ahead of the saved progress or names another commit evidence')
}

const INTERPRETATION_KINDS: ReadonlySet<string> = new Set([
  'observed',
  'execution',
  'account',
  'backgrounded',
  'background-outcome',
])

function refusedAt(failure: SessionFailure, field: string): never {
  throw new SessionValidationFailure(
    failure.kind === 'invalid' ? { ...failure, field: `${field}.${failure.field}` } : failure,
  )
}

function checkItems(observation: SessionEntriesObservation): void {
  const after = BigInt(observation.after)
  const { items } = observation
  if (BigInt(items.length) !== BigInt(observation.through) - after)
    invalidAt('items', 'the items do not fill the range')
  items.forEach((item, at) => {
    if (item.ordinal !== String(after + 1n + BigInt(at)))
      invalidAt(`items[${at}].ordinal`, 'expected the ordinal after + 1 + index')
  })
  items.forEach((item, at) => nonempty(item.key, `items[${at}].key`))
  const keys = new Set<string>()
  items.forEach((item, at) => {
    if (keys.has(item.key)) invalidAt(`items[${at}].key`, 'repeats a key of the batch')
    keys.add(item.key)
  })
  items.forEach((item, at) => {
    const parts = item.interpretation
    const known = parts.every(part => INTERPRETATION_KINDS.has(part.kind))
    const observedAlone = !parts.some(part => part.kind === 'observed') || parts.length === 1
    if (parts.length === 0 || !known || !observedAlone)
      invalidAt(`items[${at}].interpretation`, 'expected one observed or only producer facts')
  })
}

function interpret(
  snapshot: WorkSnapshot,
  observation: SessionEntriesObservation,
  outcome: DerivedAdmission | undefined,
): EntriesDecision {
  const {
    tenant,
    session,
    operation,
    run,
    execution,
    channel,
    after,
    through,
    position,
    boundary,
    items,
  } = observation
  const out: EncodedEntry[] = []
  const admitted: Extract<RoutedInput, { kind: 'ordinary' }>[] = []
  // A placeholder and the outcome of its call may share one batch, so the background state
  // advances from item to item; every other judgment reads the snapshot before the batch.
  let current = snapshot
  items.forEach((item, at) => {
    const origin = { owner: 'agent', via: SAME_LOG_ENTRIES_VIA, source: item.fact }
    item.interpretation.forEach((fact, index) => {
      const field = `items[${at}].interpretation[${index}]`
      if (fact.kind === 'observed') return
      if (fact.kind === 'backgrounded' || fact.kind === 'background-outcome') {
        const step = decideBackground(current, fact, origin, outcome)
        if (step.kind === 'rejected') refusedAt(step.failure, field)
        out.push(...step.entries)
        admitted.push(...step.admitted)
        current = { ...current, backgroundPlaceholders: step.placeholders, controls: step.controls }
        if (step.ordinal !== undefined) current = { ...current, backgroundOrdinal: step.ordinal }
        return
      }
      const decision = decideProducerFact(
        snapshot,
        { kind: 'receive', input: { tenant, session, operation, fact } },
        origin,
      )
      if (decision.kind === 'rejected') refusedAt(decision.failure, field)
      if (decision.kind !== 'entries') invalidAt(field, 'not a producer fact')
      out.push(...decision.entries)
    })
  })
  if (out.length === 0)
    invalidAt('items', 'no item has a consequence; observed items carry over to the next batch')
  const last = items[items.length - 1]
  if (last === undefined) invalidAt('items', 'the range has no item')
  const interpreted = items.map(({ ordinal, key }) => ({ ordinal, key }))
  out.push(
    encodeEntry(
      {
        kind: 'entries.interpreted',
        run,
        execution,
        channel,
        after,
        through,
        position,
        boundary: {
          revision: boundary.revision,
          executionEvidence: boundary.executionEvidence,
          count: boundary.count,
        },
        interpreted,
      },
      { owner: 'agent', via: SAME_LOG_ENTRIES_VIA, source: last.fact },
    ),
  )
  return {
    kind: 'entries',
    entries: out,
    progress: { run, execution, channel, through },
    interpreted,
    ...(admitted.length === 0 ? {} : { admitted }),
  }
}
