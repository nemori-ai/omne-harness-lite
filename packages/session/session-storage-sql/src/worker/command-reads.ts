import {
  relatedOf,
  relatedSessionOf,
  type CommitReceipt,
  type DurableEvidence,
  type ProducerRef,
  type RunId,
  type SessionCallLookup,
  type SessionCommand,
  type SessionRunLookup,
  type WorkSnapshot,
  type decide,
} from '@omne-harness/session-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import { canonicalText, sha256 } from '../codec.ts'
import type { CoveringSnapshot } from './log.ts'
import { forkFacts } from './fork.ts'
import { big, definite, oneRow, packed, rowsOf, text } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_INITIALIZATION_RECEIPTS = 1000

type Reads = Parameters<typeof decide>[4]
type Started = Readonly<{ tenant: string; session: string; previous: WorkSnapshot | null }>

function mint(record: string, content: unknown): DurableEvidence {
  return { owner: OWNER, record, revision: '1', digest: `sha256:${sha256(canonicalText(content))}` }
}

function runLookup(snapshot: WorkSnapshot, run: RunId): SessionRunLookup {
  const history = snapshot.executions?.find(item => item.run === run)
  const current =
    snapshot.run.kind === 'terminal' && snapshot.run.terminal.run === run
      ? snapshot.run.terminal
      : null
  const active = snapshot.run.kind === 'active' && snapshot.run.run === run
  if (history === undefined && current === null && !active)
    return { kind: 'absent' as const, run, covered: snapshot.revision }
  return {
    kind: 'bound' as const,
    run,
    bound: mint(`${snapshot.session}/run/${run}`, { run }),
    terminal: current ?? history?.terminal ?? null,
  }
}

function callLookup(snapshot: WorkSnapshot, producer: ProducerRef): SessionCallLookup {
  return snapshot.consumptions.some(
    item =>
      item.binding.producer.kind === producer.kind && item.binding.producer.call === producer.call,
  )
    ? {
        kind: 'bound' as const,
        producer,
        bound: mint(`${snapshot.session}/call/${producer.kind}/${producer.call}`, producer),
        terminal: null,
      }
    : { kind: 'absent' as const, producer, covered: snapshot.revision }
}

export function initializationReceipts(
  port: ParticipantPort,
  tenant: string,
  session: string,
  limit: number = MAX_INITIALIZATION_RECEIPTS,
): CommitReceipt[] | null {
  const rows = rowsOf(
    port,
    'SELECT receipt FROM sl_operation WHERE tenant = ? AND session = ? ORDER BY revision LIMIT ?',
    [tenant, session, BigInt(limit + 1)],
  )
  if (rows.length > limit) return null
  return rows.map(row => JSON.parse(packed(row['receipt'])) as CommitReceipt)
}

function controlLookups(
  command: SessionCommand,
  previous: WorkSnapshot,
): Pick<Reads, 'runs' | 'calls'> {
  if (command.kind === 'cancelRun') return { runs: [runLookup(previous, command.input.run)] }
  if (command.kind === 'stopCall') return { calls: [callLookup(previous, command.input.producer)] }
  return {}
}

export function commandReads(
  port: ParticipantPort,
  command: SessionCommand,
  start: Started,
  covering: CoveringSnapshot,
): Reads | ParticipantReply {
  const { tenant, session, previous } = start
  const frozen =
    previous === null
      ? undefined
      : oneRow(
          port,
          `SELECT o.receipt AS receipt FROM sl_entry e JOIN sl_operation o
             ON o.tenant = e.tenant AND o.session = e.session AND o.revision = e.revision
           WHERE e.tenant = ? AND e.session = ? AND e.kind = 'session.frozen' LIMIT 1`,
          [tenant, session],
        )
  const receipts =
    command.kind === 'completeInitialization' ? initializationReceipts(port, tenant, session) : []
  if (receipts === null)
    return definite('read-bound', 'the operation receipts of the session exceed the read bound')
  const related = relatedReads(port, command, tenant, covering)
  if ('kind' in related) return related
  return {
    compaction: null,
    ...related,
    ...(frozen === undefined
      ? {}
      : { frozenReceipt: JSON.parse(packed(frozen['receipt'])) as CommitReceipt }),
    ...(previous === null ? {} : controlLookups(command, previous)),
    ...(command.kind === 'completeInitialization'
      ? {
          initializationReceipts: receipts,
        }
      : {}),
  }
}

export type Journal = Readonly<{ tail: bigint; seq: bigint; epoch: string; work: WorkSnapshot }>

/** The journal row of a session with the state that covers its tail; null when there is none. */
export function journalOf(
  port: ParticipantPort,
  scope: Readonly<{ tenant: string; session: string }>,
  covering: CoveringSnapshot,
): Journal | ParticipantReply | null {
  const { tenant, session } = scope
  const row = oneRow(
    port,
    'SELECT tail, commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (row === undefined) return null
  const tail = big(row['tail'])
  const work = covering(port, tenant, session, tail)
  if (work === 'behind')
    return { kind: 'failed', diagnostic: 'the stored state does not cover the tail' }
  return { tail, seq: big(row['commit_seq']) + 1n, epoch: text(row['epoch']), work }
}

function relatedReads(
  port: ParticipantPort,
  command: SessionCommand,
  tenant: string,
  covering: CoveringSnapshot,
): Pick<Reads, 'related' | 'fork'> | ParticipantReply {
  const other = command.kind === 'create' ? relatedSessionOf(command.input.creation) : null
  if (other === null) return {}
  const journal = journalOf(port, { tenant, session: other }, covering)
  if (journal !== null && 'kind' in journal) return journal
  if (journal === null) return { related: null }
  const fork = command.kind === 'create' ? command.input.creation.fork : undefined
  if (fork?.source !== other) return { related: relatedOf(journal.work) }
  const running = journal.work.run.kind === 'active'
  const source = { session: other, epoch: journal.epoch, running }
  const facts = forkFacts(port, tenant, source, fork.point)
  return { related: relatedOf(journal.work), ...(facts === null ? {} : { fork: facts }) }
}
