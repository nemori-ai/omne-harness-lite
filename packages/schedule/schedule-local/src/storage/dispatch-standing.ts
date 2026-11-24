import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { readState } from './dispatch-records.ts'
import type { recordSchema } from './schema.ts'
import type { z } from 'zod'

type StoredRecord = z.infer<typeof recordSchema>

/** The standing column as readers see it: a block the dispatcher wrote shows over a ready standing. */
export const SHOWN_STANDING = `CASE WHEN standing <> 'ready' THEN standing ELSE COALESCE((SELECT CASE json_extract(d.state, '$.block.kind') WHEN 'blocked' THEN 'blocked' WHEN 'terminal' THEN 'terminallyInvalidated' END FROM sc_dispatch d WHERE d.owner = sc_schedules.owner AND d.schedule_id = sc_schedules.schedule_id), standing) END`

/** The schedule as readers see it; the stored record keeps what management observed, the block stays in the dispatch state. */
export function shownRecord(port: ReadPort, record: StoredRecord): StoredRecord {
  const { standing, owner, scheduleId } = record.view
  const block = standing.kind === 'ready' ? readState(port, owner, scheduleId)?.block : null
  if (block === null || block === undefined) return record
  const kind = block.kind === 'blocked' ? ('blocked' as const) : ('terminallyInvalidated' as const)
  const shown = { ...standing, kind, reasons: [...block.reasons], since: block.since }
  return { ...record, view: { ...record.view, standing: shown } }
}
