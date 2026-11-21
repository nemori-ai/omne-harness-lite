import {
  isAcceptedInputRecord,
  type CommitReceipt,
  type HistoryEntry,
} from '@omne-harness/session-contract'
import {
  packText,
  type ParticipantPort,
  type ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import { blobDigest, canonicalText, plainOf, sha256 } from '../codec.ts'
import { writeEntryText } from '../entry-codec.ts'
import { sharedEntryText, viewMessageText } from './shared-messages.ts'
import { viewHead, viewOf } from './fork.ts'
import { definite, oneRow, text } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_VIEW_ROWS = 100_000

type ViewMessage = {
  role?: string
  blocks?: { visibility?: { toModel?: boolean } }[]
  covers?: { to?: unknown }
  retained?: unknown[]
}

function messageOf(entries: readonly HistoryEntry[], index: number): ViewMessage | null {
  const entry = entries[index]
  if (entry === undefined || !entry.kind.startsWith('message.')) return null
  if (isAcceptedInputRecord(entries, index)) return null
  const message = (plainOf(entry.payload) as { message?: ViewMessage } | null)?.message
  return message ?? null
}

export function maintainModelView(
  port: ParticipantPort,
  tenant: string,
  session: string,
  epoch: string,
  entries: readonly HistoryEntry[],
  limit: number = MAX_VIEW_ROWS,
): string | null {
  let current = epoch
  const writeRow = (
    at: string,
    seq: bigint,
    entry: string,
    message: ViewMessage,
    prefix: string,
  ): string => {
    const digest = sha256(canonicalText({ prefix, entry, message }))
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        at,
        seq,
        entry,
        BigInt(Buffer.byteLength(JSON.stringify(message))),
        digest,
        message.role === 'compaction'
          ? blobDigest(canonicalText(message))
          : JSON.stringify(message),
      ],
    )
    return digest
  }
  for (const [index, entry] of entries.entries()) {
    const message = messageOf(entries, index)
    if (
      message === null ||
      message.role === 'tool_internal' ||
      !message.blocks?.some(block => block.visibility?.toModel === true)
    )
      continue
    if (message.role === 'compaction') {
      const view = viewOf(port, { tenant, session }, current)
      const upper = view.upper()
      if (upper > BigInt(limit)) return null
      const old = view.rows(0n, upper, limit, 'entry, message')
      const covers = BigInt(String(message.covers?.to ?? 0))
      const indexed = new Map(old.map(row => [text(row['entry']), row]))
      const kept = (message.retained ?? []).map(ref => {
        const row = indexed.get(String(ref))
        if (row === undefined) throw new TypeError('a retained entry is outside the current view')
        return row
      })
      const after = old.filter(row => BigInt(text(row['entry'])) > covers)
      const next = `epoch:${entry.id}`
      let prefix = ''
      let seq = 0n
      for (const row of [
        ...kept.map(row => ({
          id: text(row['entry']),
          message: JSON.parse(viewMessageText(port, tenant, text(row['message']))) as ViewMessage,
        })),
        { id: entry.id, message },
        ...after.map(row => ({
          id: text(row['entry']),
          message: JSON.parse(viewMessageText(port, tenant, text(row['message']))) as ViewMessage,
        })),
      ]) {
        seq += 1n
        prefix = writeRow(next, seq, row.id, row.message, prefix)
      }
      current = next
      continue
    }
    const last = viewHead(port, { tenant, session }, current)
    writeRow(current, (last?.seq ?? 0n) + 1n, entry.id, message, last?.digest ?? '')
  }
  return current
}

function indexExecutions(
  port: ParticipantPort,
  tenant: string,
  session: string,
  entries: readonly HistoryEntry[],
): ParticipantReply | null {
  for (const entry of entries) {
    if (entry.kind !== 'run.started') continue
    const { run, execution } = (plainOf(entry.payload) ?? {}) as Record<string, unknown>
    if (typeof run !== 'string' || typeof execution !== 'string')
      return definite('missing-row', 'an SE13 entry without its Run and execution')
    const held = oneRow(
      port,
      'SELECT session FROM sl_execution_idx WHERE tenant = ? AND execution = ? LIMIT 1',
      [tenant, execution],
    )
    if (held !== undefined)
      return definite(
        'execution-indexed',
        `the execution ${execution} is already indexed to ${
          text(held['session']) === session ? 'this session' : 'another session'
        }`,
      )
    port.execute(
      'INSERT INTO sl_execution_idx (tenant, execution, session, run, position) VALUES (?, ?, ?, ?, ?)',
      [tenant, execution, session, run, BigInt(entry.id)],
    )
  }
  return null
}

export function writeEntries(
  port: ParticipantPort,
  tenant: string,
  session: string,
  entries: readonly HistoryEntry[],
): ParticipantReply | null {
  for (const entry of entries) {
    const body = sharedEntryText(port, tenant, entry)
    port.execute(
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        BigInt(entry.id),
        BigInt(entry.revision),
        entry.kind,
        packText(body),
        BigInt(Buffer.byteLength(writeEntryText(entry))),
      ],
    )
    if (entry.kind === 'history.annotated') {
      const targets = (plainOf(entry.payload) as { targets?: unknown } | null)?.targets
      if (Array.isArray(targets))
        for (const target of targets)
          port.execute(
            'INSERT OR IGNORE INTO sl_annotation_idx (tenant, session, target, position) VALUES (?, ?, ?, ?)',
            [tenant, session, BigInt(String(target)), BigInt(entry.id)],
          )
    }
  }
  return indexExecutions(port, tenant, session, entries)
}

export function batchReceipt(
  input: Readonly<{
    tenant: string
    session: string
    operation: string
    seq: bigint
    revision: string
    entries: readonly HistoryEntry[]
  }>,
): CommitReceipt {
  const { tenant, session, operation, seq, revision, entries } = input
  const firstEntry = entries[0] as HistoryEntry
  const lastEntry = entries[entries.length - 1] as HistoryEntry
  return {
    operation,
    revision,
    first: firstEntry.id,
    last: lastEntry.id,
    recovered: false,
    source: {
      owner: OWNER,
      record: `${tenant}/${session}/${seq}`,
      revision,
      digest: `sha256:${sha256(canonicalText({ operation, first: firstEntry.id, last: lastEntry.id, kinds: entries.map(entry => entry.kind), payload: entries.map(entry => entry.payload) }))}`,
    },
  } as CommitReceipt
}

export function advanceTail(
  port: ParticipantPort,
  input: Readonly<{
    tenant: string
    session: string
    tail: bigint
    revision: string
    seq: bigint
    epoch: string
  }>,
): ParticipantReply | null {
  const { tenant, session, tail, revision, seq, epoch } = input
  const updated = port.execute(
    'UPDATE sl_journal SET tail = ?, commit_seq = ?, epoch = ? WHERE tenant = ? AND session = ? AND tail = ?',
    [BigInt(revision), seq, epoch, tenant, session, tail],
  )
  return updated.changes === 1n
    ? null
    : { kind: 'failed', diagnostic: 'the conditional tail update changed no row' }
}

export function insertOperation(
  port: ParticipantPort,
  record: Readonly<{
    tenant: string
    session: string
    operation: string
    digest: string
    form: string
    revision: bigint | null
    receipt: string
    result: string
  }>,
): void {
  const { tenant, session, operation, digest, form, revision, receipt, result } = record
  port.execute(
    'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [tenant, session, operation, digest, form, revision, packText(receipt), packText(result)],
  )
}

export function storeEvidence(
  port: ParticipantPort,
  key: Readonly<{ tenant: string; session: string; operation: string }>,
  evidence: string | null,
): void {
  if (evidence === null) return
  port.execute(
    'INSERT INTO sl_operation_evidence (tenant, session, operation, evidence) VALUES (?, ?, ?, ?)',
    [key.tenant, key.session, key.operation, evidence],
  )
}
