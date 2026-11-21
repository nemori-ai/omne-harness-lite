import { indexCompactionCall, openCompactionCalls } from './compaction-calls.ts'
import {
  isAcceptedInputRecord,
  requiredWorkEntries,
  type HistoryEntry,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { Message } from '@omne-harness/message'
import { plainOf } from '../codec.ts'
import { forkOf } from './fork.ts'
import { big, oneRow, text, type Executor, type Row } from './support.ts'

/** The origin of the chain of a session: the one it holds, the one it forked with, else its first entry. */
function originOf(
  port: Executor,
  scope: Readonly<{ tenant: string; session: string }>,
  old: Row | undefined,
  entries: readonly HistoryEntry[],
): string {
  if (old !== undefined) return text(old['origin'])
  const origin = forkOf(port, scope)?.origin ?? entries[0]?.id
  if (origin === undefined) throw new Error('the compaction index has no origin')
  return origin
}

export function writeCompactionIndex(
  port: Executor,
  input: Readonly<{
    tenant: string
    session: string
    previous: WorkSnapshot | null
    snapshot: WorkSnapshot
    entries: readonly HistoryEntry[]
  }>,
): void {
  const { tenant, session, previous, snapshot, entries } = input
  const scope = [tenant, session]
  const old = oneRow(
    port,
    'SELECT covered, origin, last_user FROM sl_compaction_head WHERE tenant = ? AND session = ? LIMIT 1',
    scope,
  )
  if (previous !== null && (old === undefined || big(old['covered']) !== BigInt(previous.revision)))
    throw new Error('the compaction index does not cover the previous log revision')
  const origin = originOf(port, { tenant, session }, old, entries)
  let lastUser =
    old?.['last_user'] === undefined || old['last_user'] === null ? null : text(old['last_user'])
  for (const [index, entry] of entries.entries()) {
    indexCompactionCall(port, { tenant, session }, entry)
    const body = plainOf(entry.payload) as Record<string, unknown> | null
    if (body === null) throw new Error('the indexed entry has no payload')
    if (entry.kind.startsWith('message.') && !isAcceptedInputRecord(entries, index)) {
      const message = body['message'] as Message
      if (message.role === 'user') lastUser = entry.id
      if (message.role === 'assistant')
        for (const block of message.blocks) {
          if (block.kind !== 'tool_call' && block.kind !== 'tool_call_unparsed') continue
          port.execute(
            `INSERT INTO sl_message_call (tenant, session, call_id, entry) VALUES (?, ?, ?, ?)
          ON CONFLICT (tenant, session, call_id) DO UPDATE SET entry = excluded.entry`,
            [...scope, block.callId, entry.id],
          )
        }
      if (message.role === 'tool') {
        const marker = message.blocks.find(block => block.kind === 'tool_result')
        if (marker?.kind !== 'tool_result')
          throw new Error('the indexed tool message has no result marker')
        const call = oneRow(
          port,
          'SELECT entry FROM sl_message_call WHERE tenant = ? AND session = ? AND call_id = ? LIMIT 1',
          [...scope, marker.callId],
        )
        port.execute(
          'INSERT INTO sl_message_pairing (tenant, session, result, call_entry) VALUES (?, ?, ?, ?)',
          [...scope, entry.id, call === undefined ? null : text(call['entry'])],
        )
      }
    }
    // An input is in the model view from its delivery; the latest one is what stays protected.
    if (entry.kind === 'message.delivered') {
      if (typeof body['input'] !== 'string') throw new Error('the delivery has no input identity')
      port.execute(
        `INSERT INTO sl_compaction_input (tenant, session, input, entry) VALUES (?, ?, ?, ?)
        ON CONFLICT (tenant, session, input) DO UPDATE SET entry = excluded.entry`,
        [...scope, body['input'], entry.id],
      )
    }
  }
  const open = new Set<string>(requiredWorkEntries(snapshot))
  for (const id of new Set([...snapshot.pending, ...(snapshot.taken ?? [])])) {
    const row = oneRow(
      port,
      'SELECT entry FROM sl_compaction_input WHERE tenant = ? AND session = ? AND input = ? LIMIT 1',
      [...scope, id],
    )
    if (row !== undefined) open.add(text(row['entry']))
  }
  for (const entry of openCompactionCalls(port, { tenant, session })) open.add(entry)
  port.execute(
    `INSERT INTO sl_compaction_head (tenant, session, covered, origin, protection, last_user)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tenant, session) DO UPDATE SET
    covered = excluded.covered, protection = excluded.protection, last_user = excluded.last_user`,
    [...scope, BigInt(snapshot.revision), origin, JSON.stringify([...open]), lastUser],
  )
}
