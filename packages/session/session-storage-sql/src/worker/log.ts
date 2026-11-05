// The judgment of one event channel interpretation commit inside the write transaction
// (session-contract docs/same-log-pure.md「事件通道的解释提交」). It reads the snapshot, the record
// of the operation identity and, in this same transaction, the history index with the Agent rows of
// the observed execution (K-5, history-index.ts); then it calls `projectSessionLog`, assigns the
// positions and reduces the batch. It writes nothing: the participant publishes the batch with the
// same steps as an entries batch.
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
import {
  entryEvidence,
  readHistory,
  type HistoryBasis,
  type HistoryFocus,
  type SessionHistory,
} from './history-index.ts'
import { assignPositions, big, oneRow, rowsOf, text } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_LOG_RECORDS = 100_000

/** A legal observation, ready to publish: the rows with their positions, and the reduced snapshot. */
export type LogBatch = Readonly<{
  tenant: string
  session: string
  operation: string
  digest: string
  journal: JournalRow
  previous: WorkSnapshot
  snapshot: WorkSnapshot
  entries: readonly HistoryEntry[]
  answer: SessionLogReceipt
  /** The input range and focus of the history read the observation was judged and reduced on. */
  decision: HistoryBasis
}>

/**
 * `recovered` answers an earlier interpretation. `recorded` is false when this identity saved no
 * record of its own: the event was interpreted by another operation, which the answer recalls.
 */
export type LogJudgment =
  | Readonly<{ kind: 'unsupported'; reason: string }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
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

/** The input range of the observation, as the memory pair reads it: a taken batch, else the pending inputs. */
function scopeOf(
  snapshot: WorkSnapshot,
  observation: SessionLogCommitObservation,
): SessionInputScope {
  const taken = observation.consequences.find(item => item.kind === 'input-taken')
  return taken?.kind === 'input-taken'
    ? { kind: 'selected', inputs: taken.batch.ordered }
    : { kind: 'pending', inputs: snapshot.pending }
}

/** The interpretation row of the Run of the observation that the batch writes. */
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

/**
 * The projection wrote no row (LC-04, LC-08). An event at or below the saved progress recalls the
 * log commit of the execution that covers it with the least progress; without one it is
 * `unavailable`. Any other event has no Session consequence and is not committed.
 */
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
    return { kind: 'failed', diagnostic: 'the log records of the session exceed the read bound' }
  const sequence = BigInt(observation.sequence)
  const covering = records
    .map(row => decodeValue(JSON.parse(text(row['result'])) as JsonValue) as SessionLogReceipt)
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

/** The snapshot of the session that covers `tail`, or `behind` when `sl_state` does not cover it. */
export type CoveringSnapshot = (
  port: ParticipantPort,
  tenant: string,
  session: string,
  tail: bigint,
) => WorkSnapshot | 'behind'

/** The head text of the `sl_state` row of the session when it covers `tail`, else `behind`. */
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

/**
 * Reads the head row and the chunk rows each time. The participant passes its parsed-snapshot
 * cache instead (`ParsedSnapshots.covering`), which reads the same head row and reads the chunks
 * only for a new head text.
 */
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

/** The rows the judgment starts from: the journal, the covering snapshot and the operation record. */
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
  // No log of (tenant, session): the answer does not tell whether another tenant has it.
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
      : { form: text(row['form']), digest: text(row['input_digest']), result: text(row['result']) }
  return { tenant, journal, previous, held }
}

/** Positions and revision for the projected rows, then the reduction and the receipt of the commit. */
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
  )
  // Every contradiction of the batch with the history: nothing is written.
  if (reduced.kind === 'quarantined')
    return { kind: 'stopped', failure: { kind: 'quarantined', diagnostic: reduced.diagnostic } }
  const progress = progressRowOf(entries, observation)
  const readThrough = executionReadThrough(reduced.snapshot, observation.run, observation.execution)
  if (progress === undefined || readThrough === null)
    return { kind: 'stopped', failure: unavailable('a log commit without its execution progress') }
  // The index is a read projection of this transaction, never stored in the snapshot row.
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
  // The recall by operation identity comes before every check of the history (M-LOG `Judge`).
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
    return { kind: 'failed', diagnostic: 'the history index of the session exceeds the read bound' }
  const prepared = { ...previous, historyIndex: history.index }
  const decision = projectSessionLog(prepared, observation, history.reads)
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
