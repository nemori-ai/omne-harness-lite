// The range check of the same-log entries interpretation (docs/same-log-pure.md「entries 通道的解释
// 提交」). It is pure: it reads no store and no clock, and it does not throw; every refusal is a
// `rejected` decision. The rules run in a fixed order and the first failure decides the kind. The
// saved progress of the session is an input, so the check does not depend on where a provider
// keeps it. Every provider of `commitEntries` calls these two functions; none writes its own check.
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { SessionFailure } from './faces.ts'
import type { Decision, EncodedEntry, OperationRecord } from './judgments.ts'
import type {
  SessionEntriesObservation,
  SessionEntriesProgress,
  SessionEntriesStart,
} from './interpretation-values.ts'
import type { WorkSnapshot } from './values.ts'
import { encodeEntry } from './entries.ts'
import { decideProducerFact } from './decide-receive.ts'
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

/**
 * The `via` of every row that an entries commit writes. It is not `same-log`: the event channel
 * pairs each `same-log` consequence with an execution progress row, and an entries row has none.
 */
export const SAME_LOG_ENTRIES_VIA = 'same-log-entries'

type EntriesDecision = Exclude<Decision, { kind: 'control-answer' }>
type ChannelKey = Pick<SessionEntriesProgress, 'run' | 'execution' | 'channel'>

const refuse = (failure: SessionFailure): EntriesDecision => ({ kind: 'rejected', failure })

/**
 * The stable digest of one observation: the same operation with the same digest recalls, with
 * another digest it is a conflict. The operation identity is not part of it, and neither is the
 * start, which is a claim about the state and not the intent. The `entries` label keeps it apart
 * from the digest of every command. Throws a TypeError for a tenant that legal-identity did not mint.
 */
export function digestSessionEntries(observation: SessionEntriesObservation): string {
  const { operation: _operation, tenant, ...rest } = observation
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    throw new TypeError('the tenant of the observation was not minted by legal-identity')
  return digestOf({ kind: 'entries', input: { ...rest, tenant: text.value } })
}

/**
 * The decision of one `commitEntries`. `saved` is the progress that the provider saved for the
 * session, one item per (run, execution, channel); `record` is the provider's record of the
 * operation identity, or null. A legal range gives `entries`: the consequence rows, then one
 * `entries.interpreted` progress row, with `progress` and `interpreted` echoing that row.
 */
export function projectSessionEntries(
  snapshot: WorkSnapshot,
  input: Readonly<{
    observation: SessionEntriesObservation
    /** The progress that the caller claims is saved: the `start` of the port. */
    start: SessionEntriesStart
    saved: readonly SessionEntriesProgress[]
    record: OperationRecord | null
  }>,
): EntriesDecision {
  const { observation, start, saved, record } = input
  // EI-01
  if (
    !tenantEquals(snapshot.tenant, observation.tenant) ||
    snapshot.session !== observation.session
  )
    return refuse({ kind: 'denied', action: 'commitEntries' })
  try {
    nonempty(observation.operation, 'operation') // EI-02
    // EI-03 and EI-04: the recall comes before every state check (SL07).
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
    return interpret(snapshot, observation)
  } catch (error) {
    if (error instanceof SessionValidationFailure) return refuse(error.failure)
    if (error instanceof TypeError || error instanceof RangeError)
      return refuse({ kind: 'invalid', field: 'observation', reason: error.message })
    throw error
  }
}

/** EI-05 canonical decimals, then EI-06 complete evidence. */
function checkForm(observation: SessionEntriesObservation): void {
  decimal(observation.after, 'after')
  decimal(observation.through, 'through')
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

/** EI-07 to EI-10: the execution, its Run and the boundary. */
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

/** EI-11 and EI-12. */
function checkRange(observation: SessionEntriesObservation): void {
  const through = BigInt(observation.through)
  if (through <= BigInt(observation.after))
    invalidAt('through', 'the range (after, through] is empty or inverted')
  if (through > BigInt(observation.boundary.count))
    invalidAt('through', 'passes the entry count of the channel')
}

/** EI-13 to EI-15: the start against the saved progress of the channel. */
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

/** EI-16 to EI-20. */
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
    const known = parts.every(
      part => part.kind === 'observed' || part.kind === 'execution' || part.kind === 'account',
    )
    const observedAlone = !parts.some(part => part.kind === 'observed') || parts.length === 1
    if (parts.length === 0 || !known || !observedAlone)
      invalidAt(`items[${at}].interpretation`, 'expected one observed or only producer facts')
  })
}

/** EI-21 through the one producer-fact encoding, EI-23, then the rows. */
function interpret(
  snapshot: WorkSnapshot,
  observation: SessionEntriesObservation,
): EntriesDecision {
  const { tenant, session, operation, run, execution, channel, after, through, boundary, items } =
    observation
  const out: EncodedEntry[] = []
  items.forEach((item, at) => {
    const origin = { owner: 'agent', via: SAME_LOG_ENTRIES_VIA, source: item.fact }
    item.interpretation.forEach((fact, index) => {
      if (fact.kind === 'observed') return
      const decision = decideProducerFact(snapshot, {
        kind: 'receive',
        input: { tenant, session, operation, fact },
      })
      if (decision.kind === 'rejected') {
        const { failure } = decision
        throw new SessionValidationFailure(
          failure.kind === 'invalid'
            ? { ...failure, field: `items[${at}].interpretation[${index}].${failure.field}` }
            : failure,
        )
      }
      if (decision.kind !== 'entries')
        invalidAt(`items[${at}].interpretation[${index}]`, 'not a producer fact')
      out.push(...decision.entries.map(entry => ({ ...entry, origin })))
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
  }
}
