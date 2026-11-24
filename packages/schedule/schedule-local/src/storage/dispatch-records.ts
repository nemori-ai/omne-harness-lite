import { z } from 'zod'
import {
  admissionRefs,
  decideAdmission,
  type AdmissionFacts,
  type DispatchState,
  type ScheduleRecord,
} from '@omne-harness/schedule'
import { ScheduleReceiptSummarySchema, type ScheduleOwner } from '@omne-harness/schedule-contract'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { dispatchStateSchema, type DispatchCommandInput } from './dispatch-schema.ts'
import { readRecord, saveRecord } from './records.ts'
import { jobRecordSchema, stopPredecessors } from './dispatch-jobs.ts'

type Admit = Extract<DispatchCommandInput, { kind: 'admit' }>

export function readState(
  port: ReadPort,
  owner: ScheduleOwner,
  scheduleId: string,
): DispatchState | null {
  const row = port.execute(
    'SELECT state FROM sc_dispatch WHERE owner = ? AND schedule_id = ? LIMIT 1',
    [canonical(owner), scheduleId],
  ).rows[0]
  return row === undefined ? null : dispatchStateSchema.parse(JSON.parse(z.string().parse(row[0])))
}

export function saveState(
  port: ParticipantPort,
  owner: ScheduleOwner,
  scheduleId: string,
  state: DispatchState,
) {
  const value = dispatchStateSchema.parse(state)
  const before = readState(port, owner, scheduleId)
  port.execute(
    'INSERT INTO sc_dispatch (owner, schedule_id, revision, next_at, state) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner, schedule_id) DO UPDATE SET revision=excluded.revision, next_at=excluded.next_at, state=excluded.state',
    [
      canonical(owner),
      scheduleId,
      value.revision,
      value.selected[0]?.scheduledAt ?? value.next?.scheduledAt ?? null,
      canonical(value),
    ],
  )
  if ((before?.block ?? null)?.since !== value.block?.since) observed(port, owner)
}

/** Readers' revision of this owner moves: what a list or a get shows has changed. */
export function observed(port: ParticipantPort, owner: ScheduleOwner) {
  port.execute(
    'INSERT INTO sc_observations (owner, revision) VALUES (?, 1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1',
    [canonical(owner)],
  )
}

export function unfinishedJobs(port: ReadPort, owner: ScheduleOwner, scheduleId: string): number {
  const count = port.execute(
    "SELECT count(*) FROM sc_jobs WHERE owner = ? AND schedule_id = ? AND state <> 'concluded' LIMIT 1",
    [canonical(owner), scheduleId],
  ).rows[0]?.[0]
  if (typeof count !== 'bigint') throw new Error('Invalid job count')
  return Number(count)
}

/** The watch start under the lock: the later of the schedule's own start and the scope's unbroken heartbeat. */
export function lockedWatchStart(
  port: ReadPort,
  owner: ScheduleOwner,
  state: DispatchState,
): string {
  const row = port.execute('SELECT watch_from FROM sc_watch WHERE owner = ? LIMIT 1', [
    canonical(owner),
  ]).rows[0]
  const scope = typeof row?.[0] === 'string' ? row[0] : null
  return scope !== null && scope > state.watchedFrom ? scope : state.watchedFrom
}

const queued = (state: DispatchState, at: string) =>
  state.selected.some(slot => slot.scheduledAt === at)

function disposedSlot(port: ReadPort, command: Admit, state: DispatchState): boolean {
  const owner = canonical(command.owner)
  const at = command.slot.scheduledAt
  if (!queued(state, at) && state.disposedThrough !== null && at <= state.disposedThrough)
    return true
  const receipt = port.execute(
    'SELECT 1 FROM sc_receipts WHERE owner = ? AND schedule_id = ? AND slot_at = ? LIMIT 1',
    [owner, command.scheduleId, at],
  ).rows[0]
  if (receipt !== undefined) return true
  return command.slot.sourceKeys.some(
    key =>
      port.execute(
        'SELECT 1 FROM sc_sources WHERE owner = ? AND schedule_id = ? AND source_key = ? LIMIT 1',
        [owner, command.scheduleId, key],
      ).rows[0] !== undefined,
  )
}

/** The admission facts as the lock reads them, with what only the outside could prepare. */
export function lockedFacts(
  port: ReadPort,
  command: Admit,
  record: ScheduleRecord,
  state: DispatchState,
): AdmissionFacts {
  const { view } = record
  const purpose = view.definition.purpose
  return {
    slot: {
      disposed: disposedSlot(port, command, state),
      earlierPending: queued(state, command.slot.scheduledAt)
        ? state.selected[0]?.scheduledAt !== command.slot.scheduledAt
        : state.selected.length > 0 ||
          (state.next !== null && state.next.scheduledAt < command.slot.scheduledAt) ||
          command.slot.scheduledAt < lockedWatchStart(port, command.owner, state),
    },
    control: view.control,
    basisCurrent: view.revision === command.revision && state.revision === command.revision,
    counts: {
      eligibleConsumed: view.eligibleConsumed,
      eligibleLimit: view.definition.limits.eligibleLimit,
      jobsAccepted: view.acceptedJobCount,
      jobLimit: view.definition.limits.jobLimit,
    },
    dependency:
      view.standing.kind === 'ready'
        ? { kind: 'ready' }
        : {
            kind: view.standing.kind === 'blocked' ? 'blocked' : 'terminal',
            reasons: view.standing.reasons,
          },
    overlap: {
      unfinished: unfinishedJobs(port, command.owner, command.scheduleId),
      policy: purpose.overlap,
    },
    ...command.prepared,
  }
}

/** The holding an exhausted schedule ends with; the guard frees the slot under the same names. */
export const releasedHolding = (quota: ScheduleRecord['quota']): ScheduleRecord['quota'] =>
  quota.kind === 'held'
    ? { kind: 'released', releaseRef: `exhausted:${quota.reservationRef}` }
    : quota

function exhausted(record: ScheduleRecord, at: string): ScheduleRecord {
  const quota = releasedHolding(record.quota)
  return {
    ...record,
    quota,
    view: { ...record.view, control: 'exhausted', nextOccurrence: null, observedAt: at as never },
  }
}

function writeJob(
  port: ParticipantPort,
  command: Admit,
  record: ScheduleRecord,
  at: string,
  waiting: boolean,
) {
  const { jobId } = admissionRefs(command.owner, command.scheduleId, command.slot.scheduledAt)
  const purpose = record.view.definition.purpose
  const body =
    purpose.kind === 'execution'
      ? {
          kind: 'execution',
          executionRef: null,
          executionState: waiting ? 'waiting' : 'accepted',
          terminalReceiptRef: null,
          outcome: null,
        }
      : {
          kind: 'notification',
          notificationIntentId: `${jobId}:notification`,
          notificationId: null,
          primaryOutcome: 'pending',
          durableAvailableReceiptRef: null,
        }
  const job = jobRecordSchema.parse({
    summary: {
      jobId,
      revision: 1,
      acceptedAt: at,
      body,
      stopState: 'none',
      stopOperationRef: null,
      stopReceiptRef: null,
    },
    scheduleId: command.scheduleId,
    slot: command.slot,
    purpose,
    definitionRevision: record.view.definitionRevision,
  })
  const owner = canonical(command.owner)
  port.execute(
    'INSERT INTO sc_jobs (owner, job_id, schedule_id, slot_at, state, job) VALUES (?, ?, ?, ?, ?, ?)',
    [
      owner,
      jobId,
      command.scheduleId,
      command.slot.scheduledAt,
      job.summary.body.kind === 'execution' ? job.summary.body.executionState : 'accepted',
      canonical(job),
    ],
  )
  port.execute('INSERT INTO sc_job_events (owner, job_id, seq, event) VALUES (?, ?, 1, ?)', [
    owner,
    jobId,
    canonical({ kind: 'accepted', at, waiting }),
  ])
  return jobId
}

/** Writes the one outcome the locked decision gives: receipt, Job, counts, how far disposed and exhaustion in one commit. */
export function writeAdmission(
  port: ParticipantPort,
  command: Admit,
  record: ScheduleRecord,
  state: DispatchState,
  at: string,
) {
  const decision = command.decision
  const owner = canonical(command.owner)
  if (decision.kind === 'retreat' || decision.kind === 'recompute') return
  if (decision.kind === 'exhaust') {
    saveRecord(port, exhausted(record, at))
    saveState(port, command.owner, command.scheduleId, { ...state, next: null })
    observed(port, command.owner)
    return
  }
  if (decision.kind === 'block' || decision.kind === 'invalidate') {
    const kind = decision.kind === 'block' ? 'blocked' : 'terminal'
    saveState(port, command.owner, command.scheduleId, {
      ...state,
      block: { kind, reasons: decision.reasons, since: at as never },
    })
    return
  }
  const accepted = decision.kind === 'accept'
  if (accepted && decision.stopPredecessors)
    stopPredecessors(port, command.owner, command.scheduleId, at)
  const jobId = accepted ? writeJob(port, command, record, at, decision.start === 'waiting') : null
  const refs = admissionRefs(command.owner, command.scheduleId, command.slot.scheduledAt)
  const purpose = record.view.definition.purpose.kind
  const receipt = ScheduleReceiptSummarySchema.parse({
    receiptId: refs.receiptId,
    decidedAt: at,
    reasonCode: accepted ? 'accepted' : decision.reason,
    operationRef: refs.operationRef,
    disposition: accepted
      ? purpose === 'execution'
        ? 'acceptedExecution'
        : 'acceptedReminder'
      : { miss: 'missed', reject: 'rejected', skip: 'skipped' }[decision.kind],
    jobId,
  })
  port.execute(
    'INSERT INTO sc_receipts (owner, schedule_id, slot_at, receipt, job_id) VALUES (?, ?, ?, ?, ?)',
    [
      owner,
      command.scheduleId,
      command.slot.scheduledAt,
      canonical({ receipt, candidate: command.slot }),
      jobId,
    ],
  )
  for (const key of command.slot.sourceKeys)
    port.execute(
      'INSERT INTO sc_sources (owner, schedule_id, source_key, slot_at) VALUES (?, ?, ?, ?)',
      [owner, command.scheduleId, key, command.slot.scheduledAt],
    )
  const counted: ScheduleRecord = {
    ...record,
    view: {
      ...record.view,
      eligibleConsumed: record.view.eligibleConsumed + 1,
      acceptedJobCount: record.view.acceptedJobCount + Number(accepted),
      nextOccurrence: command.next,
    },
  }
  saveRecord(port, decision.exhausts ? exhausted(counted, at) : counted)
  const fromQueue = queued(state, command.slot.scheduledAt)
  const through = state.disposedThrough
  saveState(port, command.owner, command.scheduleId, {
    ...state,
    disposedThrough:
      through !== null && through > command.slot.scheduledAt ? through : command.slot.scheduledAt,
    next: decision.exhausts ? null : command.next,
    block: null,
    selected: fromQueue
      ? state.selected.filter(slot => slot.scheduledAt !== command.slot.scheduledAt)
      : state.selected,
  })
  observed(port, command.owner)
}

type Classify = Extract<DispatchCommandInput, { kind: 'classify' }>

/** One missed stretch in one commit: a lapse row, its sources, the eligible count, the queue of slots to accept. */
export function writeClassification(
  port: ParticipantPort,
  command: Classify,
  record: ScheduleRecord,
  state: DispatchState,
  at: string,
) {
  const owner = canonical(command.owner)
  const counted = command.counted
  const chosen = new Set(command.selected.map(slot => slot.scheduledAt))
  const missed = counted === null ? [] : counted.filter(slot => !chosen.has(slot.scheduledAt))
  const first = counted?.[0]?.scheduledAt ?? state.next?.scheduledAt ?? command.through
  port.execute(
    'INSERT INTO sc_lapses (owner, schedule_id, from_at, through_at, lapse) VALUES (?, ?, ?, ?, ?)',
    [
      owner,
      command.scheduleId,
      first,
      command.through,
      canonical({
        from: command.from,
        cause: command.cause,
        reason: command.reason,
        count: counted === null ? null : missed.length,
        selected: command.selected.length,
        decidedAt: at,
        more: command.more,
      }),
    ],
  )
  for (const slot of missed)
    for (const key of slot.sourceKeys)
      port.execute(
        'INSERT INTO sc_sources (owner, schedule_id, source_key, slot_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [owner, command.scheduleId, key, slot.scheduledAt],
      )
  const view = {
    ...record.view,
    eligibleConsumed: record.view.eligibleConsumed + missed.length,
    nextOccurrence: command.selected[0] ?? command.next,
  }
  const next = { ...record, view }
  saveRecord(port, command.exhausts ? exhausted(next, at) : next)
  const last = counted?.at(-1)?.scheduledAt
  saveState(port, command.owner, command.scheduleId, {
    ...state,
    disposedThrough:
      command.more && last !== undefined
        ? last
        : (new Date(Date.parse(command.through) - 1).toISOString() as never),
    next: command.exhausts ? null : command.next,
    selected: command.selected,
    counting: command.more ? { through: command.through, cause: command.cause } : null,
  })
  observed(port, command.owner)
}

export { decideAdmission, readRecord }
