// The history index that the pure layer reads from a snapshot (session-contract SPEC, SessionHistoryIndex).
// This member owns the Session log, so the Session-owned part of the index is assembled here, inside
// the commit transaction, from its own rows: the routed inputs, and each attempt with the Run it
// started under. The root position is the common log root of both participants (log-root.ts).
// The Agent side of the index (executions, batches, input admissions) is not read yet: every input
// directory is an empty range of this root, and no execution, batch or taken effect is listed.
import {
  type DurableEvidence,
  type HistoryEntry,
  type InputId,
  type SessionHistoryIndex,
  type SessionHistoryReads,
  type SessionInputScope,
  type SessionAttemptRecord,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, plainOf, sha256 } from '../codec.ts'
import { logRoot } from './log-root.ts'
import { rowsOf, text } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_ROWS = 100_000

type Planted = Readonly<{
  id: string
  revision: string
  entry: HistoryEntry
  data: Record<string, unknown>
}>

export type SessionHistory = Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>

export function readHistory(
  port: ParticipantPort,
  tenant: string,
  session: string,
  snapshot: WorkSnapshot,
  scope: SessionInputScope,
  limit: number = MAX_ROWS,
): SessionHistory | 'too-many' {
  const rows = rowsOf(
    port,
    `SELECT position, revision, entry FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind IN ('intake.routed', 'run.started', 'run.attempt-started')
      ORDER BY position LIMIT ?`,
    [tenant, session, BigInt(limit + 1)],
  )
  // More rows than the bound: the index would be partial, so the commit cannot be judged on it.
  if (rows.length > limit) return 'too-many'
  const planted = (kind: string): Planted[] =>
    rows.flatMap(row => {
      const entry = decodeValue(JSON.parse(text(row['entry']))) as HistoryEntry
      return entry.kind === kind
        ? [
            {
              id: text(row['position']),
              revision: text(row['revision']),
              entry,
              data: (plainOf(entry.payload) ?? {}) as Record<string, unknown>,
            },
          ]
        : []
    })
  const common = logRoot(port, tenant, session, snapshot.revision)
  const root = {
    tenant: snapshot.tenant,
    session: snapshot.session,
    position: common.position,
    source: common.source,
  }
  const receipt = (row: Planted): DurableEvidence => ({
    owner: OWNER,
    record: `${tenant}/${session}/entry/${row.id}`,
    revision: row.revision,
    digest: `sha256:${sha256(canonicalText(row.entry))}`,
  })
  const routed = new Map<string, Planted>()
  for (const row of planted('intake.routed')) routed.set(String(row.data['input']), row)
  const known = new Map<string, DurableEvidence>()
  for (const [input, row] of routed) known.set(input, receipt(row))
  const inputs = [...new Set([...routed.keys(), ...scope.inputs])].map(input => ({
    input: input as InputId,
    directory: `${tenant}/${session}/${input}`,
    version: '0',
    count: '0',
    members: [],
    source: known.get(input) ?? root.source,
  }))
  const starts = planted('run.started')
  const attempts: SessionAttemptRecord[] = planted('run.attempt-started').flatMap(row => {
    const start = starts.find(item => item.data['run'] === row.data['run'])
    return start === undefined
      ? []
      : [
          {
            run: row.data['run'] as never,
            attempt: row.data['attempt'] as never,
            execution: String(start.data['execution']),
            ordinal: String(row.data['ordinal']),
            started: receipt(row),
          },
        ]
  })
  return {
    index: { root, inputs, executions: [], attempts, batches: [], taken: [] },
    reads: { root, scope, admissions: [], prefixes: [], attempts, taken: [] },
  }
}
