import { z } from 'zod'
import type { DispatchSchedule } from '@omne-harness/schedule'
import type { ScheduleOwner } from '@omne-harness/schedule-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { readState, unfinishedJobs } from './dispatch-records.ts'
import type { pendingRequestSchema } from './dispatch-schema.ts'
import { readRecord } from './records.ts'
import { revisionSchema } from './schema.ts'

type Pending = z.infer<typeof pendingRequestSchema>

function item(port: ReadPort, owner: ScheduleOwner, scheduleId: string): DispatchSchedule | null {
  const record = readRecord(port, owner, scheduleId as never)
  if (record === null) return null
  const latest = port.execute(
    'SELECT record FROM sc_revisions WHERE owner = ? AND schedule_id = ? ORDER BY revision DESC LIMIT 1',
    [canonical(owner), scheduleId],
  ).rows[0]
  return {
    record,
    state: readState(port, owner, scheduleId),
    latest:
      latest === undefined
        ? null
        : revisionSchema.parse(JSON.parse(z.string().parse(latest[0]))).view,
    unfinishedJobs: unfinishedJobs(port, owner, scheduleId),
  }
}

const ids = (rows: readonly (readonly unknown[])[]) => rows.map(row => z.string().parse(row[0]))

/** What one round has to do: stale states first, then due slots, each bounded by the limit. */
export function readPending(port: ReadPort, input: Pending) {
  const owner = canonical(input.owner)
  const touched = ids(
    port.execute(
      'SELECT DISTINCT schedule_id FROM sc_outbox WHERE owner = ? ORDER BY schedule_id LIMIT ?',
      [owner, input.limit],
    ).rows,
  )
  const unwatched = ids(
    port.execute(
      "SELECT s.schedule_id FROM sc_schedules s LEFT JOIN sc_dispatch d ON d.owner = s.owner AND d.schedule_id = s.schedule_id WHERE s.owner = ? AND s.control = 'active' AND d.schedule_id IS NULL ORDER BY s.schedule_id LIMIT ?",
      [owner, input.limit],
    ).rows,
  )
  const staleIds = [...new Set([...touched, ...unwatched])].slice(0, input.limit)
  const due = ids(
    port.execute(
      "SELECT d.schedule_id FROM sc_dispatch d JOIN sc_schedules s ON s.owner = d.owner AND s.schedule_id = d.schedule_id WHERE d.owner = ? AND s.control = 'active' AND d.next_at IS NOT NULL AND d.next_at <= ? ORDER BY d.next_at, d.schedule_id LIMIT ?",
      [owner, input.now, input.limit],
    ).rows,
  ).filter(id => !staleIds.includes(id))
  const earliest = port.execute(
    "SELECT min(d.next_at) FROM sc_dispatch d JOIN sc_schedules s ON s.owner = d.owner AND s.schedule_id = d.schedule_id WHERE d.owner = ? AND s.control = 'active' AND d.next_at > ? LIMIT 1",
    [owner, input.now],
  ).rows[0]?.[0]
  const active = port.execute(
    "SELECT 1 FROM sc_schedules WHERE owner = ? AND control = 'active' LIMIT 1",
    [owner],
  ).rows[0]
  const read = (list: readonly string[]) =>
    list
      .map(id => item(port, input.owner, id))
      .filter((value): value is DispatchSchedule => value !== null)
  return {
    stale: read(staleIds),
    due: read(due).filter(value => value.state?.revision === value.record.view.revision),
    active: active !== undefined,
    earliest: typeof earliest === 'string' ? earliest : null,
  }
}
