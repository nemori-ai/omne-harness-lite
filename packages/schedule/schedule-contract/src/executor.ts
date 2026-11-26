import type { ScheduleJobId } from './history.ts'
import type { ScheduleId, ScheduleInstant, ScheduleJsonValue, ScheduleOwner } from './values.ts'
import type { ScheduleWork } from './work.ts'

/** What an executor is told about one Job: its identity and the work fixed at acceptance. */
export type ScheduleExecutorJob = Readonly<{
  owner: ScheduleOwner
  jobId: ScheduleJobId
  scheduleId: ScheduleId | null
  work: ScheduleWork
  /** The execution an earlier start made; null before any start. */
  executionRef: string | null
  acceptedAt: ScheduleInstant
}>

export type ScheduleExecutorUnknown = Readonly<{ kind: 'unknown'; reason: string }>

export type ScheduleExecutorCheck =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'unavailable' | 'unsupported'; reason: string }>
  | ScheduleExecutorUnknown

export type ScheduleExecutorAcceptance =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | ScheduleExecutorUnknown

export type ScheduleExecutorStart =
  | Readonly<{ kind: 'started'; executionRef: string; running: boolean }>
  | Readonly<{ kind: 'notStarted'; recoverable: boolean; reason: string }>
  | ScheduleExecutorUnknown

export type ScheduleExecutorInspection =
  | Readonly<{ kind: 'taken' | 'running'; executionRef: string }>
  | Readonly<{
      kind: 'ended'
      report: 'succeeded' | 'failed' | 'stopped'
      result: boolean
      reason: string
    }>
  | Readonly<{ kind: 'notStarted'; recoverable: boolean; reason: string }>
  | ScheduleExecutorUnknown

export type ScheduleExecutorStop =
  | Readonly<{ kind: 'sent' | 'confirmed' }>
  | ScheduleExecutorUnknown

/** One way of carrying out a Job's work. Asking it to start the same Job again answers the same execution. `accepts` judges work before it is saved; without it every work of the path stands. */
export interface ScheduleJobExecutor {
  accepts?(work: ScheduleWork): Promise<ScheduleExecutorAcceptance>
  check(job: ScheduleExecutorJob): Promise<ScheduleExecutorCheck>
  start(job: ScheduleExecutorJob): Promise<ScheduleExecutorStart>
  inspect(job: ScheduleExecutorJob): Promise<ScheduleExecutorInspection>
  requestStop(
    job: ScheduleExecutorJob,
    urgency: 'graceful' | 'forced',
  ): Promise<ScheduleExecutorStop>
}

/** A program a deployment registers for program work; it says whether it left a final result. */
export type ScheduleProgram = Readonly<{
  name: string
  run(
    input: ScheduleJsonValue,
    context: Readonly<{ signal: AbortSignal; jobId: string }>,
  ): Promise<Readonly<{ result: boolean }>>
}>

export type ScheduleWorkPath = 'program' | 'agent.new' | 'agent.existing'

/** What carries the results and notices of a Job: a publication, a return target, an archive, or the notifications. */
export type ScheduleResultCarrier = Readonly<{
  kind: 'publication' | 'return' | 'archive' | 'notification'
  ref: string | null
}>

export type ScheduleCarrierNeed =
  | Readonly<{ kind: 'executor'; ref: ScheduleWorkPath }>
  | Readonly<{ kind: 'program'; ref: string }>
  | ScheduleResultCarrier
