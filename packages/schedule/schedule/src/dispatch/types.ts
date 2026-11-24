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
  /** Missed slots a classification chose to accept, earliest first; each is admitted like a due one. */
  selected: readonly ScheduleCandidate[]
  /** A missed stretch counted over several rounds: none of it is caught up, and nothing new is accepted until it ends. */
  counting: Readonly<{ through: ScheduleInstant; cause: string }> | null
}>

export type DispatchSchedule = Readonly<{
  record: ScheduleRecord
  state: DispatchState | null
  latest: ScheduleRevisionView | null
  unfinishedJobs: number
}>

export type DispatchPending = Readonly<{
  stale: readonly DispatchSchedule[]
  due: readonly DispatchSchedule[]
  active: boolean
  watch: Readonly<{ beatAt: ScheduleInstant; watchFrom: ScheduleInstant }> | null
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
      kind: 'classify'
      owner: ScheduleOwner
      scheduleId: ScheduleId
      revision: number
      /** The stretch is (from, through): from is how far the schedule was disposed, through is its watch start. */
      from: ScheduleInstant | null
      through: ScheduleInstant
      cause: string
      reason: string
      /** The slots of the stretch counted this round (null: not counted one by one), and those chosen to accept. */
      counted: readonly ScheduleCandidate[] | null
      selected: readonly ScheduleCandidate[]
      more: boolean
      next: ScheduleCandidate | null
      exhausts: boolean
      holding: ScheduleRecord['quota']
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
