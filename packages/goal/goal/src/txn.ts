import type { GoalRecord } from '@omne-harness/goal-contract'

/** One tenant's goals inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface GoalTxn {
  /** The latest goal of this session, live or settled. */
  latest(session: string): GoalRecord | null
  insert(record: GoalRecord): void
  replace(record: GoalRecord): void
}

export type CommitCommand = Readonly<{
  session: string
  /** The version the decision was made on: zero when the session had no goal yet. */
  expected: number
  next: GoalRecord
}>
export type CommitResult =
  | Readonly<{ kind: 'written'; record: GoalRecord }>
  | Readonly<{ kind: 'stale'; current: GoalRecord | null }>

/** The one write: it stands only on the version it was decided on, and takes the next version. */
export function commitGoal(txn: GoalTxn, command: CommitCommand): CommitResult {
  const current = txn.latest(command.session)
  if ((current?.version ?? 0) !== command.expected) return { kind: 'stale', current }
  const record = { ...command.next, version: command.expected + 1 }
  if (current !== null && current.state.generation === record.state.generation) txn.replace(record)
  else txn.insert(record)
  return { kind: 'written', record }
}
