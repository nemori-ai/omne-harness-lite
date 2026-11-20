import {
  transition,
  type Delivery,
  type Dispatch,
  type DispatchEvent,
  type DispatchId,
  type Instant,
  type SessionRef,
  type TransitionRefusal,
} from '@omne-harness/dispatch-contract'
import type { DispatchTxn } from './txn.ts'

export type AcceptCommand = Readonly<{ dispatch: Dispatch; maxOpen: number }>

export type AcceptResult =
  | Readonly<{ kind: 'accepted'; dispatch: Dispatch }>
  | Readonly<{ kind: 'recalled'; dispatch: Dispatch }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'too-many-open' }>

/** What a request fixes. A second request under the same identity must fix the same. */
const sameRequest = (known: Dispatch, asked: Dispatch): boolean =>
  known.dispatcher === asked.dispatcher &&
  known.call === asked.call &&
  known.mode === asked.mode &&
  known.agent === asked.agent &&
  known.instruction === asked.instruction &&
  known.expectation === asked.expectation

/** One transaction: the dispatch is registered once, and the count of open dispatches is judged with it. */
export function acceptDispatch(txn: DispatchTxn, command: AcceptCommand): AcceptResult {
  const { dispatch } = command
  const known = txn.dispatch(dispatch.id)
  if (known !== null)
    return sameRequest(known, dispatch)
      ? { kind: 'recalled', dispatch: known }
      : { kind: 'conflict' }
  if (txn.openOf(dispatch.dispatcher) >= command.maxOpen) return { kind: 'too-many-open' }
  txn.insert(dispatch)
  return { kind: 'accepted', dispatch }
}

export type EventCommand = Readonly<{
  of: Readonly<{ id: DispatchId }> | Readonly<{ session: SessionRef }>
  event: DispatchEvent
  at: Instant
}>

export type EventResult =
  | Readonly<{ kind: 'changed' | 'recalled' | 'unchanged'; dispatch: Dispatch }>
  | Readonly<{ kind: 'refused'; reason: TransitionRefusal; dispatch: Dispatch }>
  | Readonly<{ kind: 'absent' }>

/** One transaction: the row is read, the cell of the table is applied, the row is written. */
export function applyEvent(txn: DispatchTxn, command: EventCommand): EventResult {
  const found = 'id' in command.of ? txn.dispatch(command.of.id) : txn.ofSession(command.of.session)
  if (found === null) return { kind: 'absent' }
  const result = transition(found, command.event, command.at)
  if (result.kind === 'refused') return { ...result, dispatch: found }
  if (result.kind !== 'changed') return { kind: result.kind, dispatch: found }
  txn.replace(result.next)
  return { kind: 'changed', dispatch: result.next }
}

export type DeliveryCommand = Readonly<{
  id: DispatchId
  delivery: Exclude<Delivery, { kind: 'pending' }>
  at: Instant
}>

export type DeliveryResult =
  | Readonly<{ kind: 'recorded' | 'recalled'; dispatch: Dispatch }>
  | Readonly<{ kind: 'conflict'; dispatch: Dispatch }>
  | Readonly<{ kind: 'absent' }>

const sameDelivery = (left: Delivery | null, right: Delivery): boolean =>
  left !== null &&
  left.kind === right.kind &&
  (left.kind !== 'delivered' || (right.kind === 'delivered' && left.to === right.to))

/** One transaction: a pending delivery gets its one place. A place already recorded is never replaced. */
export function recordDelivery(txn: DispatchTxn, command: DeliveryCommand): DeliveryResult {
  const found = txn.dispatch(command.id)
  if (found === null) return { kind: 'absent' }
  if (found.delivery?.kind !== 'pending')
    return sameDelivery(found.delivery, command.delivery)
      ? { kind: 'recalled', dispatch: found }
      : { kind: 'conflict', dispatch: found }
  const next = Object.freeze({ ...found, delivery: command.delivery, changedAt: command.at })
  txn.replace(next)
  return { kind: 'recorded', dispatch: next }
}

export type StopCommand = Readonly<{ id: DispatchId; at: Instant }>

/** One transaction: the stop that was asked for is recorded as confirmed, once. */
export function confirmStop(txn: DispatchTxn, command: StopCommand): Dispatch | null {
  const found = txn.dispatch(command.id)
  if (found === null || found.stop !== 'requested') return found
  const next = Object.freeze({ ...found, stop: 'confirmed' as const, changedAt: command.at })
  txn.replace(next)
  return next
}
