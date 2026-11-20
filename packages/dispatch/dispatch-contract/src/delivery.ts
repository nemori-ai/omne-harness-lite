import type { Delivery, Dispatch } from './values.ts'

/** What Tool answered when the outcome was handed to the wait of the dispatching call. */
export type WaitAnswer = 'delivered' | 'closed' | 'unreadable'

/** What is known when a delivery is settled. `input` and `archived` are read only after the wait answered closed. */
export type DeliveryObservation = Readonly<{
  wait: WaitAnswer
  input: 'present' | 'absent' | 'unknown'
  archived: boolean | 'unknown'
}>

export type DeliveryStep =
  | Readonly<{ kind: 'record'; delivery: Exclude<Delivery, { kind: 'pending' }> }>
  | Readonly<{ kind: 'send-input' }>
  | Readonly<{ kind: 'hold' }>

const HOLD: DeliveryStep = Object.freeze({ kind: 'hold' })
const record = (delivery: Exclude<Delivery, { kind: 'pending' }>): DeliveryStep => ({
  kind: 'record',
  delivery,
})

export function deliveryDue(dispatch: Pick<Dispatch, 'delivery'>): boolean {
  return dispatch.delivery?.kind === 'pending'
}

/** Only the answer "closed" moves a report to the input: while the wait cannot be read, nothing is sent. */
export function settleDelivery(
  dispatch: Pick<Dispatch, 'state' | 'delivery'>,
  observed: DeliveryObservation,
): DeliveryStep {
  if (!deliveryDue(dispatch)) return HOLD
  if (observed.wait === 'delivered') return record({ kind: 'delivered', to: 'result' })
  if (observed.wait === 'unreadable') return HOLD
  if (dispatch.state !== 'reported') return record({ kind: 'wait-closed' })
  if (observed.input === 'present') return record({ kind: 'delivered', to: 'input' })
  if (observed.input === 'unknown' || observed.archived === 'unknown') return HOLD
  return observed.archived ? record({ kind: 'undeliverable' }) : { kind: 'send-input' }
}
