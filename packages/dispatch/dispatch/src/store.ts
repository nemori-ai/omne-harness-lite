import {
  isOpen,
  type Dispatch,
  type DispatchId,
  type DispatchQuery,
  type SessionRef,
  type TenantId,
} from '@omne-harness/dispatch-contract'
import type {
  AcceptCommand,
  AcceptResult,
  DeliveryCommand,
  DeliveryResult,
  EventCommand,
  EventResult,
  StopCommand,
} from './transactions.ts'

/** What a commit answered. `unknown`: it is not known whether the facts were written. */
export type StoreAnswer<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>

/** A read either returns the facts or says it could not read. It never answers empty instead. */
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

/** The registry of dispatches, in the words of the domain. Each write is one commit of one tenant and runs one script. */
export interface DispatchStore {
  accept(tenant: TenantId, command: AcceptCommand): Promise<StoreAnswer<AcceptResult>>
  apply(tenant: TenantId, command: EventCommand): Promise<StoreAnswer<EventResult>>
  recordDelivery(tenant: TenantId, command: DeliveryCommand): Promise<StoreAnswer<DeliveryResult>>
  confirmStop(tenant: TenantId, command: StopCommand): Promise<StoreAnswer<Dispatch | null>>

  dispatch(tenant: TenantId, id: DispatchId): Promise<StoreRead<Dispatch | null>>
  ofSession(tenant: TenantId, session: SessionRef): Promise<StoreRead<Dispatch | null>>
  openOf(tenant: TenantId, dispatcher: SessionRef): Promise<StoreRead<number>>
  list(tenant: TenantId, query: DispatchQuery): Promise<StoreRead<readonly Dispatch[]>>
  /** The dispatches that still have a step to take: open, an outcome not handed over, a stop not confirmed. */
  unfinished(tenant: TenantId): Promise<StoreRead<readonly Dispatch[]>>
}

/** True when a dispatch still has a step to take: it is open, its outcome is not handed over, or its stop is not confirmed. */
export const isUnfinished = (dispatch: Dispatch): boolean =>
  isOpen(dispatch) || dispatch.delivery?.kind === 'pending' || dispatch.stop === 'requested'
