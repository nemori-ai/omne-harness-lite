import type {
  ScheduleCandidate,
  ScheduleId,
  ScheduleInstant,
  ScheduleJobId,
  ScheduleOwner,
  ScheduleReceiptId,
  ScheduleRevisionView,
} from '@omne-harness/schedule-contract'
import type { ScheduleRecord } from '../management/types.ts'
import type { Admission, AdmissionFacts } from './admission.ts'

export type WatchCause = 'enabled' | 'resumed' | 'recovered' | 'takeover'

export type DispatchBlock = Readonly<{ kind: 'blocked' | 'terminal'; reasons: readonly string[] }>

/** The dispatch state of one schedule: how far it is disposed, what is due next, and since when it is watched. */
export type DispatchState = Readonly<{
  revision: number
  watchedFrom: ScheduleInstant
  watchedCause: WatchCause
  disposedThrough: ScheduleInstant | null
  next: ScheduleCandidate | null
  block: DispatchBlock | null
}>

export type DispatchSchedule = Readonly<{
  record: ScheduleRecord
  state: DispatchState | null
  /** The latest management change of the schedule; null when its revisions are not read. */
  latest: ScheduleRevisionView | null
  unfinishedJobs: number
}>

export type DispatchPending = Readonly<{
  /** Active schedules whose state is missing or behind their revision, and schedules with unread management events. */
  stale: readonly DispatchSchedule[]
  due: readonly DispatchSchedule[]
  active: boolean
  /** The earliest next slot of an active schedule that is not due yet. */
  earliest: ScheduleInstant | null
}>

/** What a commit takes from outside the lock: facts no transaction can read, prepared before it. */
export type AdmissionPrepared = Pick<
  AdmissionFacts,
  'hasNext' | 'missingCarriers' | 'reminderClosed' | 'standing'
>

export type DispatchCommand =
  | Readonly<{ kind: 'beat'; owner: ScheduleOwner; at: ScheduleInstant; gapMs: number }>
  | Readonly<{
      kind: 'refresh'
      owner: ScheduleOwner
      scheduleId: ScheduleId
      revision: number
      state: DispatchState | null
      at: ScheduleInstant
    }>
  | Readonly<{
      kind: 'admit'
      owner: ScheduleOwner
      scheduleId: ScheduleId
      revision: number
      slot: ScheduleCandidate
      next: ScheduleCandidate | null
      prepared: AdmissionPrepared
      decision: Admission
      /** The quota holding the schedule had when prepared; exhaustion releases it in the same commit. */
      holding: ScheduleRecord['quota']
      receiptId: ScheduleReceiptId
      jobId: ScheduleJobId
      at: ScheduleInstant
    }>

export type DispatchCommitResult =
  | Readonly<{ kind: 'committed'; replayed: boolean }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'unknown' }>

export interface DispatchStore {
  pending(
    now: ScheduleInstant,
    limit: number,
  ): Promise<Readonly<{ kind: 'ok'; value: DispatchPending }> | Readonly<{ kind: 'unavailable' }>>
  commit(command: DispatchCommand): Promise<DispatchCommitResult>
}
