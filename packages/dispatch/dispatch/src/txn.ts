import type { Dispatch, DispatchId, SessionRef } from '@omne-harness/dispatch-contract'

/** One tenant's dispatches inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface DispatchTxn {
  dispatch(id: DispatchId): Dispatch | null
  /** The dispatch that created this session, when a dispatch did. */
  ofSession(session: SessionRef): Dispatch | null
  /** How many dispatches of this dispatching session are accepted or started. */
  openOf(dispatcher: SessionRef): number
  insert(dispatch: Dispatch): void
  replace(dispatch: Dispatch): void
}
