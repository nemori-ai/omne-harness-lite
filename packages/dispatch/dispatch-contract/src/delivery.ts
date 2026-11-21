import type { Delivery, Dispatch } from './values.ts'

/** What Tool answered when the outcome was handed to the wait of the dispatching call. */
export type WaitAnswer = 'delivered' | 'closed' | 'unreadable'

/** Where the report input is in the dispatching session, and whether that session is archived. */
export type SecondPlace = Readonly<{
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

/** Only the answer "closed" sends a report on to its second place: while the wait cannot be read, nothing moves. */
export function settleWait(
  dispatch: Pick<Dispatch, 'state' | 'delivery'>,
  wait: WaitAnswer,
): DeliveryStep | Readonly<{ kind: 'look' }> {
  if (!deliveryDue(dispatch) || wait === 'unreadable') return HOLD
  if (wait === 'delivered') return record({ kind: 'delivered', to: 'result' })
  return dispatch.state === 'reported' ? { kind: 'look' } : record({ kind: 'wait-closed' })
}

/** The second place of a report whose wait is closed: the input that is there, an archived dispatcher, or a send. */
export function settleSecondPlace(seen: SecondPlace): DeliveryStep {
  if (seen.input === 'present') return record({ kind: 'delivered', to: 'input' })
  if (seen.input === 'unknown' || seen.archived === 'unknown') return HOLD
  return seen.archived ? record({ kind: 'undeliverable' }) : { kind: 'send-input' }
}
