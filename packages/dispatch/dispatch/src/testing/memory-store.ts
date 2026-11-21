import {
  isOpen,
  type Dispatch,
  type DispatchId,
  type DispatchQuery,
  type SessionRef,
  type TenantId,
} from '@omne-harness/dispatch-contract'
import { isUnfinished, type DispatchStore, type StoreAnswer, type StoreRead } from '../store.ts'
import { acceptDispatch, applyEvent, confirmStop, recordDelivery } from '../transactions.ts'
import type { DispatchTxn } from '../txn.ts'

/** One tenant's dispatches. Plain data, so a transaction is a copy that replaces the original. */
export type TenantDispatches = Map<DispatchId, Dispatch>

export function memoryTxn(rows: TenantDispatches): DispatchTxn {
  const all = () => [...rows.values()]
  return {
    dispatch: id => rows.get(id) ?? null,
    ofSession: session => all().find(row => row.session === session) ?? null,
    openOf: dispatcher => all().filter(row => row.dispatcher === dispatcher && isOpen(row)).length,
    insert: dispatch => void rows.set(dispatch.id, dispatch),
    replace: dispatch => void rows.set(dispatch.id, dispatch),
  }
}

export function matches(dispatch: Dispatch, query: DispatchQuery): boolean {
  const { by, states } = query
  const named =
    'dispatcher' in by
      ? dispatch.dispatcher === by.dispatcher
      : by.sessions.includes(dispatch.session)
  return named && (states === undefined || states.includes(dispatch.state))
}

export type MemoryFault = 'unknown-after-commit' | 'unknown-before-commit' | 'rolled-back'

export type MemoryDispatchStore = DispatchStore &
  Readonly<{
    /** The next commit answers this instead of its result. */
    failNext(fault: MemoryFault): void
    /** Reads answer `unavailable` while this is set. */
    readable(on: boolean): void
    rows(tenant: TenantId): readonly Dispatch[]
  }>

/** The registry in memory: the same scripts as the SQL store, with faults a test can ask for. */
export function createMemoryDispatchStore(): MemoryDispatchStore {
  const tenants = new Map<TenantId, TenantDispatches>()
  let fault: MemoryFault | null = null
  let canRead = true
  const of = (tenant: TenantId): TenantDispatches => {
    const found = tenants.get(tenant) ?? new Map()
    tenants.set(tenant, found)
    return found
  }

  async function commit<T>(
    tenant: TenantId,
    run: (txn: DispatchTxn) => T,
  ): Promise<StoreAnswer<T>> {
    const pending = fault
    fault = null
    if (pending === 'rolled-back') return { kind: 'rolled-back' }
    if (pending === 'unknown-before-commit') return { kind: 'unknown' }
    const copy: TenantDispatches = new Map(of(tenant))
    const value = run(memoryTxn(copy))
    tenants.set(tenant, copy)
    return pending === 'unknown-after-commit' ? { kind: 'unknown' } : { kind: 'committed', value }
  }

  async function read<T>(
    tenant: TenantId,
    run: (txn: DispatchTxn, rows: readonly Dispatch[]) => T,
  ): Promise<StoreRead<T>> {
    if (!canRead) return { kind: 'unavailable' }
    const rows = of(tenant)
    return { kind: 'read', value: run(memoryTxn(rows), [...rows.values()]) }
  }

  const byTime = (left: Dispatch, right: Dispatch) =>
    left.acceptedAt < right.acceptedAt ? -1 : left.acceptedAt > right.acceptedAt ? 1 : 0

  return {
    accept: (tenant, command) => commit(tenant, txn => acceptDispatch(txn, command)),
    apply: (tenant, command) => commit(tenant, txn => applyEvent(txn, command)),
    recordDelivery: (tenant, command) => commit(tenant, txn => recordDelivery(txn, command)),
    confirmStop: (tenant, command) => commit(tenant, txn => confirmStop(txn, command)),
    dispatch: (tenant, id: DispatchId) => read(tenant, txn => txn.dispatch(id)),
    ofSession: (tenant, session: SessionRef) => read(tenant, txn => txn.ofSession(session)),
    openOf: (tenant, dispatcher: SessionRef) => read(tenant, txn => txn.openOf(dispatcher)),
    list: (tenant, query) =>
      read(tenant, (_txn, rows) => rows.filter(row => matches(row, query)).sort(byTime)),
    unfinished: tenant => read(tenant, (_txn, rows) => rows.filter(isUnfinished).sort(byTime)),
    failNext: next => void (fault = next),
    readable: on => void (canRead = on),
    rows: tenant => [...of(tenant).values()],
  }
}
