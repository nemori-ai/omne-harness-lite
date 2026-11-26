import { z } from 'zod'
import {
  ScheduleCandidateSchema,
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleJobIdSchema,
  ScheduleOwnerSchema,
  ScheduleReceiptSummarySchema,
  ScheduleRefSchema,
  type ScheduleExecutionRow,
  type ScheduleOwner,
  type ScheduleWork,
} from '@omne-harness/schedule-contract'
import type { ReadPort, SqlValue } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { jobRecordSchema, readJob } from './dispatch-jobs.ts'
import { storageScopeSchema } from './schema.ts'

const common = { scope: storageScopeSchema, owner: ScheduleOwnerSchema }
export const historyRequestSchemas = [
  z.strictObject({
    kind: z.literal('history'),
    ...common,
    scheduleId: ScheduleIdSchema.nullable(),
    from: ScheduleInstantSchema.nullable(),
    to: ScheduleInstantSchema.nullable(),
    cursor: z.string().min(1).nullable(),
    limit: z.int().min(1).max(500),
  }),
  z.strictObject({ kind: z.literal('historyRevision'), ...common }),
  z.strictObject({ kind: z.literal('jobDetail'), ...common, jobId: ScheduleJobIdSchema }),
  z.strictObject({
    kind: z.literal('jobCancel'),
    ...common,
    jobId: ScheduleJobIdSchema,
    operation: ScheduleRefSchema,
  }),
] as const
export type HistoryRequest = z.infer<(typeof historyRequestSchemas)[number]>

/** The history only grows: receipts, lapses and Job events are appended, never rewritten, so their count orders its versions. */
export function historyRevision(port: ReadPort, owner: ScheduleOwner): string {
  const value = port.execute(
    'SELECT (SELECT count(*) FROM sc_receipts WHERE owner = ?) + (SELECT count(*) FROM sc_lapses WHERE owner = ?) + (SELECT count(*) FROM sc_job_events WHERE owner = ?) LIMIT 1',
    [canonical(owner), canonical(owner), canonical(owner)],
  ).rows[0]?.[0]
  if (typeof value !== 'bigint') throw new Error('Invalid history revision')
  return `history/${value}`
}

const ROWS = `
SELECT r.slot_at AS at, 'slot:' || r.schedule_id || ':' || r.slot_at AS ref, 'slot' AS kind, r.schedule_id AS schedule_id, r.receipt AS a, j.job AS b
  FROM sc_receipts r LEFT JOIN sc_jobs j ON j.owner = r.owner AND j.job_id = r.job_id WHERE r.owner = ?1
UNION ALL
SELECT l.from_at, 'lapse:' || l.schedule_id || ':' || l.from_at, 'lapse', l.schedule_id, l.lapse, l.through_at
  FROM sc_lapses l WHERE l.owner = ?1
UNION ALL
SELECT d.slot_at, 'direct:' || d.job_id, 'direct', NULL, d.job, NULL
  FROM sc_jobs d WHERE d.owner = ?1 AND d.schedule_id IS NULL`

const lapseSchema = z.object({
  cause: z.string(),
  reason: z.string(),
  count: z.int().nullable(),
  selected: z.int(),
})

function rowOf(row: Record<string, unknown>): ScheduleExecutionRow {
  const at = ScheduleInstantSchema.parse(row['at'])
  const rowRef = z.string().parse(row['ref'])
  if (row['kind'] === 'direct') {
    const job = jobRecordSchema.parse(JSON.parse(z.string().parse(row['a'])))
    return {
      kind: 'direct',
      rowRef,
      originalScheduledAt: at,
      job: job.summary,
      run: { ...job.run, reason: job.reason },
    }
  }
  const scheduleId = ScheduleIdSchema.parse(row['schedule_id'])
  if (row['kind'] === 'lapse') {
    const lapse = lapseSchema.parse(JSON.parse(z.string().parse(row['a'])))
    return {
      kind: 'lapse',
      rowRef,
      scheduleId,
      originalScheduledAt: at,
      through: ScheduleInstantSchema.parse(row['b']),
      ...lapse,
    }
  }
  const stored = z
    .object({ receipt: ScheduleReceiptSummarySchema, candidate: ScheduleCandidateSchema })
    .parse(JSON.parse(z.string().parse(row['a'])))
  const job = row['b'] === null ? null : jobRecordSchema.parse(JSON.parse(String(row['b'])))
  return {
    kind: 'slot',
    rowRef,
    scheduleId,
    occurrenceKey: stored.candidate.sourceKeys[0] ?? rowRef,
    originalScheduledAt: at,
    candidate: stored.candidate,
    preparation: null,
    receipt: stored.receipt,
    job: job?.summary ?? null,
    run: job === null ? null : { ...job.run, reason: job.reason },
    notification: null,
  }
}

const cursorSchema = z.tuple([ScheduleInstantSchema, z.string().min(1)])

/** One page of history, newest first: slots, lapses and direct Jobs merged by their original time. */
export function readHistory(port: ReadPort, input: Extract<HistoryRequest, { kind: 'history' }>) {
  const where: string[] = []
  const params: SqlValue[] = [canonical(input.owner)]
  const add = (clause: string, ...values: SqlValue[]) => {
    where.push(clause)
    params.push(...values)
  }
  if (input.scheduleId !== null) add('schedule_id = ?', input.scheduleId)
  if (input.from !== null) add('at >= ?', input.from)
  if (input.to !== null) add('at < ?', input.to)
  const filter = where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}`
  const total = port.execute(`SELECT count(*) FROM (${ROWS})${filter} LIMIT 1`, params).rows[0]?.[0]
  if (typeof total !== 'bigint') throw new Error('Invalid history total')
  const after = input.cursor === null ? null : cursorSchema.parse(JSON.parse(input.cursor))
  if (after !== null) add('(at < ? OR (at = ? AND ref < ?))', after[0], after[0], after[1])
  const page = where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}`
  const result = port.execute(`SELECT * FROM (${ROWS})${page} ORDER BY at DESC, ref DESC LIMIT ?`, [
    ...params,
    input.limit + 1,
  ])
  const records = result.rows.map(values =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  )
  const items = records.slice(0, input.limit).map(rowOf)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      records.length > input.limit && last !== undefined
        ? JSON.stringify([last.originalScheduledAt, last.rowRef])
        : null,
    total: { kind: 'exact' as const, value: Number(total) },
    complete: true,
    observationRevision: historyRevision(port, input.owner),
  }
}

/** Where the execution of a Job is: a run of a program, or the session agent work runs in. What the session left is read from its executor when the Job is read, so it is null here. */
function whereOf(work: ScheduleWork | null, executionRef: string | null) {
  if (executionRef === null || work === null) return null
  return work.kind === 'program'
    ? { kind: 'program' as const, programRef: work.programRef, executionRef }
    : { kind: 'session' as const, sessionRef: executionRef, account: null }
}

/** A Job with everything recorded about it: its fixed requirement, where it runs and each step it took. */
export function readJobDetail(port: ReadPort, owner: ScheduleOwner, jobId: string) {
  const job = readJob(port, owner, jobId)
  if (job === null) return null
  const events = port
    .execute(
      'SELECT seq, event FROM sc_job_events WHERE owner = ? AND job_id = ? ORDER BY seq LIMIT 500',
      [canonical(owner), jobId],
    )
    .rows.map(([seq, event]) => {
      const value = z
        .object({ kind: z.string(), at: ScheduleInstantSchema })
        .parse(JSON.parse(z.string().parse(event)))
      return { seq: Number(seq), kind: value.kind, at: value.at }
    })
  const { body } = job.summary
  const executionRef = body.kind === 'execution' ? body.executionRef : null
  const work = job.purpose.kind === 'execution' ? job.purpose.work : null
  return {
    job: job.summary,
    run: job.run,
    scheduleId: job.scheduleId,
    slot: job.slot,
    purpose: job.purpose,
    definitionRevision: job.definitionRevision,
    reason: job.reason,
    executionWhere: whereOf(work, executionRef),
    events,
  }
}

/** Whether a cancel carrying this operation was committed on the Job. */
export function cancelRecorded(
  port: ReadPort,
  owner: ScheduleOwner,
  jobId: string,
  operation: string,
): boolean {
  return port
    .execute('SELECT event FROM sc_job_events WHERE owner = ? AND job_id = ? LIMIT 500', [
      canonical(owner),
      jobId,
    ])
    .rows.some(([event]) => {
      const value = JSON.parse(z.string().parse(event)) as { kind?: unknown; operation?: unknown }
      return value.kind === 'cancel' && value.operation === operation
    })
}

export function readHistoryRequest(port: ReadPort, input: HistoryRequest) {
  switch (input.kind) {
    case 'history':
      return { kind: 'ok', value: readHistory(port, input) }
    case 'historyRevision':
      return { kind: 'ok', value: { observationRevision: historyRevision(port, input.owner) } }
    case 'jobDetail':
      return { kind: 'ok', value: readJobDetail(port, input.owner, input.jobId) }
    case 'jobCancel':
      return {
        kind: 'ok',
        value: cancelRecorded(port, input.owner, input.jobId, input.operation),
      }
  }
}
