// The judgment of one entries interpretation commit inside the write transaction (session-contract
// docs/same-log-pure.md「entries 通道的解释提交」). It reads the inputs of the shared pure check from
// the tables (the snapshot with its saved progress, and the record of the operation identity),
// calls `projectSessionEntries`, assigns the positions and reduces the batch. It writes nothing:
// the participant publishes the batch with the same steps as a command batch.
import {
  digestSessionEntries,
  projectSessionEntries,
  reduce,
  type CommitReceipt,
  type HistoryEntry,
  type OperationRecord,
  type SessionEntriesObservation,
  type SessionEntriesReceipt,
  type SessionEntriesStart,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { decodeValue } from '../codec.ts'
import { readCoveringSnapshot, type CoveringSnapshot } from './log.ts'
import { assignPositions, big, oneRow, packed, text, type DefiniteFailure } from './support.ts'

/** The journal row of the session before the batch. */
export type JournalRow = Readonly<{ tail: bigint; seq: bigint; epoch: string }>

/** A legal range, ready to publish: the rows with their positions, and the reduced snapshot. */
export type EntriesBatch = Readonly<{
  tenant: string
  session: string
  operation: string
  digest: string
  journal: JournalRow
  previous: WorkSnapshot
  snapshot: WorkSnapshot
  entries: readonly HistoryEntry[]
  answer: SessionEntriesReceipt
}>

export type EntriesJudgment =
  | Readonly<{ kind: 'unsupported'; reason: string }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'definite'; failure: DefiniteFailure; diagnostic: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'recovered'; result: unknown; digest: string }>
  | Readonly<{ kind: 'publish'; batch: EntriesBatch }>

type Input = Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }>

function inputOf(facts: Readonly<Record<string, JsonValue>>): Input | string {
  if (typeof facts['observation'] !== 'object' || typeof facts['start'] !== 'object')
    return 'the entries facts are incomplete'
  try {
    return {
      observation: decodeValue(facts['observation'] as JsonValue) as SessionEntriesObservation,
      start: decodeValue(facts['start'] as JsonValue) as SessionEntriesStart,
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'undecodable facts'
  }
}

export function judgeEntries(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  covering: CoveringSnapshot = readCoveringSnapshot,
): EntriesJudgment {
  const input = inputOf(facts)
  if (typeof input === 'string') return { kind: 'unsupported', reason: input }
  const { observation, start } = input
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
    return { kind: 'stopped', failure: { kind: 'denied', action: 'commitEntries' } }
  const journal: JournalRow = {
    tail: big(journalRow['tail']),
    seq: big(journalRow['commit_seq']) + 1n,
    epoch: text(journalRow['epoch']),
  }
  const previous = covering(port, tenant, session, journal.tail)
  if (previous === 'behind')
    return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }

  // Every form of record takes part: a batch, control or answer record has another digest, so
  // the pure check answers conflict for it (SL07).
  const held = oneRow(
    port,
    'SELECT input_digest, receipt, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [tenant, session, operation],
  )
  const record: OperationRecord | null =
    held === undefined
      ? null
      : {
          operation,
          digest: text(held['input_digest']),
          receipt: JSON.parse(packed(held['receipt'])) as CommitReceipt,
        }
  const decision = projectSessionEntries(previous, {
    observation,
    start,
    saved: previous.entriesProgress ?? [],
    record,
  })
  const digest = digestSessionEntries(observation)
  if (decision.kind === 'rejected') return { kind: 'stopped', failure: decision.failure }
  if (decision.kind === 'recovered') {
    if (held === undefined)
      return {
        kind: 'definite',
        failure: 'missing-row',
        diagnostic: 'a recalled operation without a record',
      }
    return {
      kind: 'recovered',
      result: decodeValue(JSON.parse(packed(held['result'])) as JsonValue),
      digest,
    }
  }
  if (decision.progress === undefined)
    return {
      kind: 'definite',
      failure: 'missing-row',
      diagnostic: 'an entries decision without its progress',
    }

  const revision = String(journal.tail + 1n)
  const entries = assignPositions(port, { tenant, session }, revision, decision.entries)
  const reduced = reduce(previous, { revision, entries } as never)
  // RD-1 to RD-3 and every other contradiction: nothing is written.
  if (reduced.kind === 'quarantined')
    return {
      kind: 'stopped',
      failure: { kind: 'quarantined', diagnostic: reduced.diagnostic },
    }
  return {
    kind: 'publish',
    batch: {
      tenant,
      session,
      operation,
      digest,
      journal,
      previous,
      snapshot: reduced.snapshot,
      entries,
      answer: {
        operation: observation.operation,
        through: decision.progress.through,
        interpreted: reduced.snapshot.source,
      },
    },
  }
}
