import { indexCompactionCall, openCompactionCalls } from './compaction-calls.ts'
import {
  requiredWorkEntries,
  type HistoryEntry,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { Message } from '@omne-harness/message'
import { plainOf } from '../codec.ts'
import { big, oneRow, text, type Executor } from './support.ts'

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
  const origin = old === undefined ? entries[0]?.id : text(old['origin'])
  if (origin === undefined) throw new Error('the compaction index has no origin')
  let lastUser =
    old?.['last_user'] === undefined || old['last_user'] === null ? null : text(old['last_user'])
  for (const entry of entries) {
    indexCompactionCall(port, { tenant, session }, entry)
    const body = plainOf(entry.payload) as Record<string, unknown> | null
    if (body === null) throw new Error('the indexed entry has no payload')
    if (entry.kind.startsWith('message.')) {
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
    if (entry.kind === 'intake.routed') {
      if (typeof body['input'] !== 'string')
        throw new Error('the input route has no input identity')
      port.execute(
        'INSERT INTO sl_compaction_input (tenant, session, input, entry) VALUES (?, ?, ?, ?)',
        [...scope, body['input'], lastUser ?? entry.id],
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
    if (row === undefined) throw new Error('the pending input has no original history reference')
    open.add(text(row['entry']))
  }
  for (const entry of openCompactionCalls(port, { tenant, session })) open.add(entry)
  port.execute(
    `INSERT INTO sl_compaction_head (tenant, session, covered, origin, protection, last_user)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tenant, session) DO UPDATE SET
    covered = excluded.covered, protection = excluded.protection, last_user = excluded.last_user`,
    [...scope, BigInt(snapshot.revision), origin, JSON.stringify([...open]), lastUser],
  )
}
