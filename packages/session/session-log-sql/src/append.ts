import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  compareInteger,
  type AppendRequest,
  type AppendRejection,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import { narrow, type WriteTx } from '@omne-harness-lite/storage'
import {
  appendEntries,
  ensureJournal,
  numberFrom,
  tenantFrom,
  type JournalRow,
  type LogDatabase,
} from './database.ts'

async function fenceRejection(
  tx: WriteTx,
  request: AppendRequest,
): Promise<AppendRejection | undefined> {
  if (request.fence.kind === 'unfenced') return
  const seen = await narrow<LogDatabase>(tx)
    .selectFrom('sl_attempt')
    .selectAll()
    .where('session', '=', request.session)
    .where('run', '=', request.fence.run)
    .executeTakeFirst()
  if (seen !== undefined && compareInteger(numberFrom(seen.attempt), request.fence.attempt) > 0)
    return { failure: 'attemptSuperseded' }
}
async function dedupeRejection(
  tx: WriteTx,
  request: AppendRequest,
): Promise<AppendRejection | undefined> {
  const keys = request.entries.flatMap(entry =>
    entry.dedupeKey === undefined ? [] : [entry.dedupeKey],
  )
  if (keys.length === 0) return
  const found = await narrow<LogDatabase>(tx)
    .selectFrom('sl_entry')
    .select('dedupe_key')
    .where('session', '=', request.session)
    .where('dedupe_key', 'in', keys)
    .execute()
  if (found.length === 0) return
  const present = new Set(found.map(row => row.dedupe_key))
  return { failure: 'alreadyRecorded', keys: Object.freeze(keys.filter(key => present.has(key))) }
}
async function rejection(
  tx: WriteTx,
  request: AppendRequest,
  row: JournalRow,
): Promise<AppendRejection | undefined> {
  const first = request.entries[0]
  if (first === undefined) throw new TypeError('validated append is empty')
  if (!tenantIdEquals(tenantFrom(row.tenant), first.tenant)) return { failure: 'tenantMismatch' }
  const fenced = await fenceRejection(tx, request)
  if (fenced !== undefined) return fenced
  const duplicate = await dedupeRejection(tx, request)
  if (duplicate !== undefined) return duplicate
  if (
    request.condition.kind === 'tailEquals' &&
    compareInteger(numberFrom(row.tail), request.condition.tail) !== 0
  )
    return { failure: 'tailChanged', tail: numberFrom(row.tail) }
}
/** All decisions and inserts use the caller's original write transaction and Session lock. */
export async function stageAppend(
  tx: WriteTx,
  request: AppendRequest,
  generation: string,
  batch: string,
): Promise<{ readonly entries: readonly LogEntry[] } | AppendRejection> {
  const first = request.entries[0]
  if (first === undefined) throw new TypeError('validated append is empty')
  const row = await ensureJournal(
    tx,
    { tenant: first.tenant, session: request.session },
    generation,
  )
  const rejected = await rejection(tx, request, row)
  if (rejected !== undefined) return Object.freeze(rejected)
  return Object.freeze({ entries: await appendEntries(tx, request, row, batch) })
}
