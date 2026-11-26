import type { GoalRecord, JudgeModel } from '@omne-harness/goal-contract'
import type { CommitCommand, CommitResult } from './txn.ts'

/** `rolled-back`: nothing was written. `unknown`: written or not, nobody can tell. */
export type StoreAnswer<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

/** The goals of the tenants. A write is one commit of one tenant and runs one script. */
export interface GoalStore {
  commit(tenant: string, command: CommitCommand): Promise<StoreAnswer<CommitResult>>
  latest(tenant: string, session: string): Promise<StoreRead<GoalRecord | null>>
  /** The goals that still owe their session a reminder, or the examining side a batch. */
  owing(tenant: string): Promise<StoreRead<readonly GoalRecord[]>>
  /** The live goal this session examines for, or null when it examines for none. */
  examinedBy(tenant: string, examiner: string): Promise<StoreRead<GoalRecord | null>>
  /** The decision model a session chose for the judging of its goals; null when it chose none. */
  chosen(tenant: string, session: string): Promise<StoreRead<JudgeModel | null>>
  choose(tenant: string, session: string, model: JudgeModel | null): Promise<StoreAnswer<null>>
}
