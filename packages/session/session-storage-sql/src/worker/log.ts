import { callsLeft, lentTo, type CallsLeft } from './call-left.ts'
import {
  digestSessionLog,
  executionReadThrough,
  projectSessionLog,
  reduce,
  type HistoryEntry,
  type SessionFailure,
  type SessionInputScope,
  type SessionLogCommitObservation,
  type SessionLogReceipt,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { decodeValue, plainOf } from '../codec.ts'
import type { JournalRow } from './entries.ts'
import { readState } from './state-rows.ts'
import { entryEvidence } from './history-rows.ts'
import {
  readHistory,
  type HistoryBasis,
  type HistoryFocus,
  type SessionHistory,
} from './history-index.ts'
import {
  assignPositions,
  big,
  oneRow,
  packed,
  rowsOf,
  text,
  type DefiniteFailure,
} from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_LOG_RECORDS = 100_000

export type LogBatch = Readonly<{
  tenant: string
  session: string
  operation: string
  digest: string
  journal: JournalRow
  previous: WorkSnapshot
  snapshot: WorkSnapshot
  entries: readonly HistoryEntry[]
  left: CallsLeft
  answer: SessionLogReceipt
  decision: HistoryBasis
}>

export type LogJudgment =
  | Readonly<{ kind: 'unsupported'; reason: string }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'definite'; failure: DefiniteFailure; diagnostic: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'recovered'; result: unknown; digest: string; recorded: boolean }>
  | Readonly<{ kind: 'publish'; batch: LogBatch }>

const unavailable = (diagnostic: string): SessionFailure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

function observationOf(
  facts: Readonly<Record<string, JsonValue>>,
): SessionLogCommitObservation | string {
  if (typeof facts['observation'] !== 'object' || facts['observation'] === null)
    return 'the log facts are incomplete'
  try {
    return decodeValue(facts['observation']) as SessionLogCommitObservation
  } catch (error) {
    return error instanceof Error ? error.message : 'undecodable facts'
  }
}

function scopeOf(
  snapshot: WorkSnapshot,
  observation: SessionLogCommitObservation,
): SessionInputScope {
  const taken = observation.consequences.find(item => item.kind === 'input-taken')
  return taken?.kind === 'input-taken'
    ? { kind: 'selected', inputs: taken.batch.ordered }
    : { kind: 'pending', inputs: snapshot.pending }
}

function progressRowOf(
  entries: readonly HistoryEntry[],
  observation: SessionLogCommitObservation,
): HistoryEntry | undefined {
  return entries.findLast(row => {
    if (row.kind !== 'history.annotated') return false
    const data = plainOf(row.payload) as Record<string, unknown> | null
    return data?.['run'] === observation.run && typeof data['execution'] === 'object'
  })
}

function withoutRows(
  port: ParticipantPort,
  key: Readonly<{ tenant: string; session: string }>,
  prepared: WorkSnapshot,
  observation: SessionLogCommitObservation,
  digest: string,
): LogJudgment {
  const reached = executionReadThrough(prepared, observation.run, observation.execution)
  if (
    observation.sequence === null ||
    reached === null ||
    BigInt(observation.sequence) > BigInt(reached)
  )
    return {
      kind: 'stopped',
      failure: {
        kind: 'invalid',
        field: 'consequences',
        reason: 'an observation without a Session consequence is not committed',
      },
    }
  const records = rowsOf(
    port,
    `SELECT result FROM sl_operation WHERE tenant = ? AND session = ? AND form = 'log' LIMIT ?`,
    [key.tenant, key.session, BigInt(MAX_LOG_RECORDS + 1)],
  )
  if (records.length > MAX_LOG_RECORDS)
    return {
      kind: 'definite',
      failure: 'read-bound',
      diagnostic: 'the log records of the session exceed the read bound',
    }
  const sequence = BigInt(observation.sequence)
  const covering = records
    .map(row => decodeValue(JSON.parse(packed(row['result'])) as JsonValue) as SessionLogReceipt)
    .filter(
      item => item.execution === observation.execution && BigInt(item.readThrough) >= sequence,
    )
    .sort((left, right) => (BigInt(left.readThrough) < BigInt(right.readThrough) ? -1 : 1))[0]
  return covering === undefined
    ? {
        kind: 'stopped',
        failure: unavailable('the interpretation commit of that sequence is not held'),
      }
    : { kind: 'recovered', result: { ...covering, recovered: true }, digest, recorded: false }
}

export type CoveringSnapshot = (
  port: ParticipantPort,
  tenant: string,
  session: string,
  tail: bigint,
) => WorkSnapshot | 'behind'

export function readCoveringHead(
  port: ParticipantPort,
  tenant: string,
  session: string,
  tail: bigint,
): string | 'behind' {
  const state = oneRow(
    port,
    'SELECT snapshot, covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (state === undefined || big(state['covered']) !== tail) return 'behind'
  return text(state['snapshot'])
}

export const readCoveringSnapshot: CoveringSnapshot = (port, tenant, session, tail) => {
  const read = readState(port, tenant, session, tail)
  return read === 'behind' ? read : read.snapshot
}

type Read = Readonly<{
  tenant: string
  journal: JournalRow
  previous: WorkSnapshot
  held: Readonly<{ form: string; digest: string; result: string }> | undefined
}>

function readStart(
  port: ParticipantPort,
  observation: SessionLogCommitObservation,
  covering: CoveringSnapshot,
): Read | LogJudgment {
  const tenantText = tenantCodec.encode(observation.tenant)
  if (!tenantText.ok)
    return {
      kind: 'stopped',
      failure: { kind: 'invalid', field: 'tenant', reason: 'not minted by legal-identity' },
    }
  const tenant = tenantText.value
  const { session, operation } = observation
  const journalRow = oneRow(
    port,
    'SELECT tail, commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (journalRow === undefined)
    return { kind: 'stopped', failure: { kind: 'denied', action: 'commitLog' } }
  const journal: JournalRow = {
    tail: big(journalRow['tail']),
    seq: big(journalRow['commit_seq']) + 1n,
    epoch: text(journalRow['epoch']),
  }
  const previous = covering(port, tenant, session, journal.tail)
  if (previous === 'behind')
    return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
  const row = oneRow(
    port,
    'SELECT input_digest, form, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [tenant, session, operation],
  )
  const held =
    row === undefined
      ? undefined
      : {
          form: text(row['form']),
          digest: text(row['input_digest']),
          result: packed(row['result']),
        }
  return { tenant, journal, previous, held }
}

function batchOf(
  port: ParticipantPort,
  start: Read,
  observation: SessionLogCommitObservation,
  digest: string,
  projected: Readonly<{
    prepared: WorkSnapshot
    entries: readonly HistoryEntry[]
    history: SessionHistory
    focus: HistoryFocus
  }>,
): LogJudgment {
  const { tenant, journal } = start
  const { session } = observation
  const revision = String(journal.tail + 1n)
  const entries = assignPositions(port, { tenant, session }, revision, projected.entries)
  const reduced = reduce(
    projected.prepared,
    { revision, entries } as never,
    projected.history.reads,
    callsLeft(port, { tenant, session }),
  )
  if (reduced.kind === 'quarantined')
    return { kind: 'stopped', failure: { kind: 'quarantined', diagnostic: reduced.diagnostic } }
  const progress = progressRowOf(entries, observation)
  const readThrough = executionReadThrough(reduced.snapshot, observation.run, observation.execution)
  if (progress === undefined || readThrough === null)
    return { kind: 'stopped', failure: unavailable('a log commit without its execution progress') }
  const { historyIndex: _index, ...snapshot } = reduced.snapshot
  return {
    kind: 'publish',
    batch: {
      tenant,
      session,
      operation: observation.operation,
      digest,
      journal,
      previous: start.previous,
      snapshot,
      entries,
      left: reduced,
      answer: {
        operation: observation.operation,
        execution: observation.execution,
        readThrough,
        interpreted: entryEvidence(tenant, session, progress),
        recovered: false,
      },
      decision: { scope: projected.history.reads.scope, focus: projected.focus },
    },
  }
}

export function judgeLog(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  covering: CoveringSnapshot = readCoveringSnapshot,
): LogJudgment {
  const observation = observationOf(facts)
  if (typeof observation === 'string') return { kind: 'unsupported', reason: observation }
  const start = readStart(port, observation, covering)
  if ('kind' in start) return start
  const { tenant, previous, held } = start
  const digest = digestSessionLog(observation)
  if (held !== undefined)
    return held.form === 'log' && held.digest === digest
      ? {
          kind: 'recovered',
          result: decodeValue(JSON.parse(held.result) as JsonValue),
          digest,
          recorded: true,
        }
      : { kind: 'stopped', failure: { kind: 'conflict', operation: observation.operation } }
  const focus: HistoryFocus = {
    executions: [observation.execution],
    event:
      observation.sequence === null
        ? null
        : { execution: observation.execution, sequence: observation.sequence },
  }
  const history = readHistory(
    port,
    tenant,
    observation.session,
    previous,
    scopeOf(previous, observation),
    { focus },
  )
  if (history === 'too-many')
    return {
      kind: 'definite',
      failure: 'read-bound',
      diagnostic: 'the history index of the session exceeds the read bound',
    }
  const prepared = { ...previous, historyIndex: history.index }
  const lent = lentTo(port, { tenant, session: observation.session }, prepared, observation)
  const decision = projectSessionLog(lent, observation, history.reads)
  if (decision.kind === 'rejected') return { kind: 'stopped', failure: decision.failure }
  if (decision.kind !== 'entries')
    return {
      kind: 'stopped',
      failure: unavailable('a log projection that is not a batch of entries'),
    }
  if (decision.entries.length === 0)
    return withoutRows(
      port,
      { tenant, session: observation.session },
      prepared,
      observation,
      digest,
    )
  return batchOf(port, start, observation, digest, {
    prepared,
    entries: decision.entries as unknown as HistoryEntry[],
    history,
    focus,
  })
}
