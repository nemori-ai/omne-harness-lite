import type { GoalRecord } from '@omne-harness/goal-contract'
import type { GoalStore, StoreAnswer, StoreRead } from '../store.ts'
import { commitGoal, type GoalTxn } from '../txn.ts'

/** One tenant's goals, every one a session ever had, in the order they were set. */
export type TenantGoals = GoalRecord[]

export function memoryTxn(rows: TenantGoals): GoalTxn {
  const at = (record: GoalRecord) =>
    rows.findIndex(
      row => row.session === record.session && row.state.generation === record.state.generation,
    )
  return {
    latest: session => rows.findLast(row => row.session === session) ?? null,
    insert(record) {
      const live = rows.some(
        row => row.session === record.session && row.state.status !== 'settled',
      )
      if (at(record) !== -1 || (live && record.state.status !== 'settled'))
        throw new Error('a session has one live goal at most')
      rows.push(record)
    },
    replace: record => void rows.splice(at(record), 1, record),
  }
}

export type MemoryFault = 'unknown-after-commit' | 'unknown-before-commit' | 'rolled-back'

export type MemoryGoalStore = GoalStore &
  Readonly<{
    /** The next commit answers this instead of its result. */
    failNext(fault: MemoryFault): void
    /** Reads answer `unavailable` while this is off. */
    readable(on: boolean): void
    rows(tenant: string): readonly GoalRecord[]
  }>

/** The goals in memory: the same script as the SQL store, with faults a test can ask for. */
export function createMemoryGoalStore(): MemoryGoalStore {
  const tenants = new Map<string, TenantGoals>()
  let fault: MemoryFault | null = null
  let canRead = true
  const of = (tenant: string): TenantGoals => {
    const found = tenants.get(tenant) ?? []
    tenants.set(tenant, found)
    return found
  }
  const read = async <T>(tenant: string, run: (rows: TenantGoals) => T): Promise<StoreRead<T>> =>
    canRead ? { kind: 'read', value: run(of(tenant)) } : { kind: 'unavailable' }

  return {
    async commit(tenant, command): Promise<StoreAnswer<ReturnType<typeof commitGoal>>> {
      const pending = fault
      fault = null
      if (pending === 'rolled-back') return { kind: 'rolled-back' }
      if (pending === 'unknown-before-commit') return { kind: 'unknown' }
      const copy = [...of(tenant)]
      try {
        const value = commitGoal(memoryTxn(copy), command)
        tenants.set(tenant, copy)
        return pending === 'unknown-after-commit'
          ? { kind: 'unknown' }
          : { kind: 'committed', value }
      } catch {
        return { kind: 'rolled-back' }
      }
    },
    latest: (tenant, session) => read(tenant, rows => memoryTxn(rows).latest(session)),
    owing: tenant => read(tenant, rows => rows.filter(row => row.wake !== null)),
    failNext: next => void (fault = next),
    readable: on => void (canRead = on),
    rows: tenant => [...of(tenant)],
  }
}
