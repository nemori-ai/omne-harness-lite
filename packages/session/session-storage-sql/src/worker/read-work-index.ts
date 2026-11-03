// The history index of a snapshot that the work cache folded on the main thread (SPEC RT-04,
// C-TOPOLOGY §2.9): the cache holds the snapshot, and this handler builds its index with the same
// function and bound as the whole work read (read-work.ts), in one read snapshot. The input carries the fields of the
// snapshot that the index reads (`workIndexOf`): tenant text, session, revision, pending inputs, the
// current Run and the executions of earlier Runs, each with its execution and read-through only.
// The index is answered only at the tail the cache folded to. The snapshot row moves only with the
// tail (C-TOPOLOGY §3.1 P-4), so a publication count that moved on since does not change the
// snapshot: the index is read at the current count, and the answer names that count, which the
// cache registers. Another tail, or a count below the one asked, is `stale`, and the cache then
// reads the snapshot whole.
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../codec.ts'
import { workIndexOf } from './history-index.ts'
import { handler, oneRow, scopeOf, text } from './support.ts'

const count = /^\d+$/

export default handler('session.work-index', (input, port) => {
  const scope = scopeOf(input)
  const { tail, published, snapshot } = input as Readonly<Record<string, JsonValue>>
  if (
    scope === null ||
    typeof tail !== 'string' ||
    !count.test(tail) ||
    typeof published !== 'string' ||
    !count.test(published) ||
    snapshot === undefined
  )
    throw new Error('invalid input')
  const row = oneRow(
    port,
    `SELECT j.tail AS tail, r.published AS published
       FROM sl_journal j
       LEFT JOIN er_root r ON r.tenant = j.tenant AND r.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return { kind: 'stale' }
  const now = row['published'] === null ? '0' : text(row['published'])
  if (text(row['tail']) !== tail || BigInt(now) < BigInt(published)) return { kind: 'stale' }
  const index = workIndexOf(
    port,
    scope.tenant,
    scope.session,
    decodeValue(snapshot) as WorkSnapshot,
  )
  return index === 'too-many'
    ? { kind: 'too-many' }
    : { kind: 'index', published: now, index: encodeValue(index.index) }
})
