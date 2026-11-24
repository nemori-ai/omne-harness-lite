import { z } from 'zod'
import { advanceJob, type DispatchJob, type JobEvent, type JobFacts } from '@omne-harness/schedule'
import {
  ScheduleCandidateSchema,
  ScheduleJobSummarySchema,
  SchedulePurposeSchema,
  type ScheduleOwner,
} from '@omne-harness/schedule-contract'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, equal } from './encoding.ts'

export const jobRecordSchema = z.strictObject({
  summary: ScheduleJobSummarySchema,
  scheduleId: z.string().min(1).nullable(),
  slot: ScheduleCandidateSchema.nullable(),
  purpose: SchedulePurposeSchema,
  definitionRevision: z.int().nonnegative(),
  reason: z.string().nullable().default(null),
})
export type JobRecord = z.infer<typeof jobRecordSchema>

export function factsOf(job: JobRecord): JobFacts | null {
  const { body } = job.summary
  if (body.kind !== 'execution') return null
  return {
    state: body.executionState,
    stopState: job.summary.stopState,
    executionRef: body.executionRef,
    outcome: body.outcome === 'unknown' ? null : body.outcome,
    reason: job.reason,
  }
}

/** A Job record carrying the facts after one step: the summary's revision moves by one. */
export function withFacts(job: JobRecord, facts: JobFacts): JobRecord {
  const { summary } = job
  const body =
    facts.state === 'concluded'
      ? {
          kind: 'execution' as const,
          executionRef: facts.executionRef,
          executionState: 'concluded' as const,
          terminalReceiptRef: `${summary.jobId}:concluded`,
          outcome: facts.outcome ?? 'failed',
        }
      : {
          kind: 'execution' as const,
          executionRef: facts.executionRef,
          executionState: facts.state,
          terminalReceiptRef: null,
          outcome: null,
        }
  return jobRecordSchema.parse({
    ...job,
    reason: facts.reason,
    summary: { ...summary, revision: summary.revision + 1, body, stopState: facts.stopState },
  })
}

export function readJob(port: ReadPort, owner: ScheduleOwner, jobId: string): JobRecord | null {
  const row = port.execute('SELECT job FROM sc_jobs WHERE owner = ? AND job_id = ? LIMIT 1', [
    canonical(owner),
    jobId,
  ]).rows[0]
  return row === undefined ? null : jobRecordSchema.parse(JSON.parse(z.string().parse(row[0])))
}

export function saveJob(
  port: ParticipantPort,
  owner: ScheduleOwner,
  job: JobRecord,
  event: unknown,
) {
  const facts = factsOf(job)
  const state = facts?.state ?? 'accepted'
  port.execute('UPDATE sc_jobs SET state = ?, job = ? WHERE owner = ? AND job_id = ?', [
    state,
    canonical(job),
    canonical(owner),
    job.summary.jobId,
  ])
  port.execute('INSERT INTO sc_job_events (owner, job_id, seq, event) VALUES (?, ?, ?, ?)', [
    canonical(owner),
    job.summary.jobId,
    job.summary.revision,
    canonical(event),
  ])
}

/** One step of one Job under the lock: the stored facts and the event must give the same next facts. */
export function stepJob(
  port: ParticipantPort,
  owner: ScheduleOwner,
  input: Readonly<{
    jobId: string
    revision: number
    event: JobEvent
    next: JobFacts
    at: string
    operation?: string | undefined
  }>,
): boolean {
  const job = readJob(port, owner, input.jobId)
  const facts = job === null ? null : factsOf(job)
  if (job === null || facts === null || job.summary.revision !== input.revision) return false
  const step = advanceJob(facts, input.event)
  if (step.kind !== 'move' || !equal(step.next, input.next)) return false
  const { operation } = input
  saveJob(port, owner, withFacts(job, step.next), {
    ...input.event,
    at: input.at,
    ...(operation === undefined ? {} : { operation }),
  })
  return true
}

/** Replacing: the unconcluded Jobs of the schedule are cancelled if not started, or asked to stop. */
export function stopPredecessors(
  port: ParticipantPort,
  owner: ScheduleOwner,
  scheduleId: string,
  at: string,
) {
  const rows = port.execute(
    "SELECT job FROM sc_jobs WHERE owner = ? AND schedule_id = ? AND state <> 'concluded' ORDER BY slot_at",
    [canonical(owner), scheduleId],
  ).rows
  for (const row of rows) {
    const job = jobRecordSchema.parse(JSON.parse(z.string().parse(row[0])))
    const facts = factsOf(job)
    const step = facts === null ? null : advanceJob(facts, { kind: 'cancel' })
    if (step?.kind === 'move')
      saveJob(port, owner, withFacts(job, step.next), { kind: 'cancel', by: 'replace', at })
  }
}

export function openJobs(port: ReadPort, owner: ScheduleOwner, limit: number): DispatchJob[] {
  const rows = port.execute(
    "SELECT job, schedule_id, slot_at FROM sc_jobs WHERE owner = ? AND state <> 'concluded' ORDER BY slot_at LIMIT ?",
    [canonical(owner), limit],
  ).rows
  return toDispatchJobs(port, owner, rows)
}

function toDispatchJobs(
  port: ReadPort,
  owner: ScheduleOwner,
  rows: readonly (readonly unknown[])[],
): DispatchJob[] {
  return rows.flatMap(row => {
    const job = jobRecordSchema.parse(JSON.parse(z.string().parse(row[0])))
    const facts = factsOf(job)
    if (facts === null) return []
    const earlier = port.execute(
      "SELECT 1 FROM sc_jobs WHERE owner = ? AND schedule_id = ? AND state <> 'concluded' AND slot_at < ? LIMIT 1",
      [canonical(owner), String(row[1]), String(row[2])],
    ).rows[0]
    return [
      {
        jobId: job.summary.jobId,
        scheduleId: job.scheduleId as never,
        slotAt: (job.slot?.scheduledAt ?? null) as never,
        acceptedAt: job.summary.acceptedAt,
        work: job.purpose.kind === 'execution' ? job.purpose.work : null,
        facts,
        revision: job.summary.revision,
        quietBefore: earlier === undefined,
      },
    ]
  })
}

/** A Job started outside any schedule: accepted now, with no slot and no count; its key taken by other work is a conflict. */
export function writeDirect(
  port: ParticipantPort,
  input: Readonly<{ owner: ScheduleOwner; jobId: string; work: unknown; at: string }>,
): boolean {
  const existing = readJob(port, input.owner, input.jobId)
  if (existing !== null)
    return existing.purpose.kind === 'execution' && equal(existing.purpose.work, input.work)
  const job = jobRecordSchema.parse({
    summary: {
      jobId: input.jobId,
      revision: 1,
      acceptedAt: input.at,
      body: {
        kind: 'execution',
        executionRef: null,
        executionState: 'accepted',
        terminalReceiptRef: null,
        outcome: null,
      },
      stopState: 'none',
      stopOperationRef: null,
      stopReceiptRef: null,
    },
    scheduleId: null,
    slot: null,
    purpose: {
      kind: 'execution',
      work: input.work,
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'parallel',
      misfire: null,
      notifications: [],
    },
    definitionRevision: 0,
  })
  port.execute(
    'INSERT INTO sc_jobs (owner, job_id, schedule_id, slot_at, state, job) VALUES (?, ?, NULL, ?, ?, ?)',
    [canonical(input.owner), input.jobId, input.at, 'accepted', canonical(job)],
  )
  port.execute('INSERT INTO sc_job_events (owner, job_id, seq, event) VALUES (?, ?, 1, ?)', [
    canonical(input.owner),
    input.jobId,
    canonical({ kind: 'accepted', direct: true, at: input.at }),
  ])
  return true
}

export function dispatchJobOf(
  port: ReadPort,
  owner: ScheduleOwner,
  jobId: string,
): DispatchJob | null {
  const row = port.execute(
    'SELECT job, schedule_id, slot_at FROM sc_jobs WHERE owner = ? AND job_id = ? LIMIT 1',
    [canonical(owner), jobId],
  ).rows
  return toDispatchJobs(port, owner, row)[0] ?? null
}
