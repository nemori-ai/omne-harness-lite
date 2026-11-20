import {
  deliveryDue,
  settleDelivery,
  type Delivery,
  type Dispatch,
  type DispatchEvent,
  type DispatchId,
  type TenantId,
} from '@omne-harness/dispatch-contract'
import { reportInputOf } from './identity.ts'
import type { Clock } from './ports.ts'
import type { DispatchSessions, InputFate } from './session-port.ts'
import type { ReportWaits, WaitOutcome } from './wait-port.ts'
import type { DispatchStore } from './store.ts'

export type AdvanceDependencies = Readonly<{
  store: DispatchStore
  sessions: DispatchSessions
  waits: ReportWaits
  clock: Clock
}>

/** The longest chain one dispatch walks in one go: create, end, hand over, send, record, stop. */
const MAX_STEPS = 6

const outcomeOf = (dispatch: Dispatch): WaitOutcome => ({
  id: dispatch.id,
  state: dispatch.state,
  session: dispatch.session,
  report: dispatch.report,
  failure: dispatch.failure,
  expectation: dispatch.expectation,
})

const endOf = (fate: InputFate): DispatchEvent | null => {
  if (fate.kind === 'ended') return { kind: 'run-ended', reply: fate.reply }
  if (fate.kind === 'failed' || fate.kind === 'cancelled')
    return { kind: 'run-failed', cause: `run-${fate.kind}`, detail: fate.detail }
  return null
}

/** Every step re-does the same thing under the same identity; an unknown result leaves the dispatch where it is. */
export function createAdvance(deps: AdvanceDependencies) {
  const { store, sessions, waits, clock } = deps

  async function apply(tenant: TenantId, id: DispatchId, event: DispatchEvent): Promise<boolean> {
    const answer = await store.apply(tenant, { of: { id }, event, at: clock.now() })
    return answer.kind === 'committed' && answer.value.kind === 'changed'
  }

  async function record(
    tenant: TenantId,
    id: DispatchId,
    delivery: Exclude<Delivery, { kind: 'pending' }>,
  ): Promise<boolean> {
    const answer = await store.recordDelivery(tenant, { id, delivery, at: clock.now() })
    return answer.kind === 'committed' && answer.value.kind === 'recorded'
  }

  /** `accepted`: the session is created with the permission mode the dispatching session has now. */
  async function create(dispatch: Dispatch): Promise<boolean> {
    const { tenant, id } = dispatch
    const row = await sessions.row(tenant, dispatch.dispatcher)
    if (row.kind !== 'read') return false
    if (row.value === null || row.value.archived)
      return apply(tenant, id, { kind: 'dispatcher-archived' })
    const { session } = dispatch
    const { permission } = row.value
    const answer = await sessions.create(tenant, { session, dispatch, permission })
    if (answer.kind === 'unknown') return false
    return apply(
      tenant,
      id,
      answer.kind === 'created'
        ? { kind: 'session-created' }
        : { kind: 'session-failed', detail: answer.detail },
    )
  }

  /** `started`: the end of the run the starting input started is the end of the dispatch. */
  async function follow(dispatch: Dispatch): Promise<boolean> {
    const fate = await sessions.startFate(dispatch.tenant, dispatch.session)
    const event = fate.kind === 'read' ? endOf(fate.value) : null
    return event !== null && apply(dispatch.tenant, dispatch.id, event)
  }

  async function sendReport(dispatch: Dispatch): Promise<boolean> {
    const answer = await sessions.send(dispatch.tenant, {
      to: dispatch.dispatcher,
      input: reportInputOf(dispatch.id),
      source: 'dispatch.report',
      text: dispatch.report?.text ?? '',
      from: { session: dispatch.session, agent: dispatch.agent },
    })
    if (answer.kind === 'unknown') return false
    return record(
      dispatch.tenant,
      dispatch.id,
      answer.kind === 'sent' ? { kind: 'delivered', to: 'input' } : { kind: 'undeliverable' },
    )
  }

  /** An outcome goes to the wait; only when Tool answers that the wait is closed is the rest read. */
  async function handOver(dispatch: Dispatch): Promise<boolean> {
    const { tenant, id, dispatcher } = dispatch
    const wait = await waits.hand(tenant, dispatch, outcomeOf(dispatch))
    const closed = wait === 'closed' && dispatch.state === 'reported'
    const has = closed ? await sessions.has(tenant, dispatcher, reportInputOf(id)) : null
    const row = closed ? await sessions.row(tenant, dispatcher) : null
    const step = settleDelivery(dispatch, {
      wait,
      input: has === null || has.kind !== 'read' ? 'unknown' : has.value ? 'present' : 'absent',
      archived: row === null || row.kind !== 'read' ? 'unknown' : (row.value?.archived ?? true),
    })
    if (step.kind === 'hold') return false
    return step.kind === 'record' ? record(tenant, id, step.delivery) : sendReport(dispatch)
  }

  async function stop(dispatch: Dispatch): Promise<boolean> {
    const answer = await sessions.cancelStart(dispatch.tenant, dispatch.session)
    if (answer !== 'stopped') return false
    const confirmed = await store.confirmStop(dispatch.tenant, {
      id: dispatch.id,
      at: clock.now(),
    })
    return confirmed.kind === 'committed'
  }

  function stepOf(dispatch: Dispatch): Promise<boolean> {
    if (dispatch.state === 'accepted') return create(dispatch)
    if (dispatch.state === 'started') return follow(dispatch)
    if (deliveryDue(dispatch)) return handOver(dispatch)
    return dispatch.stop === 'requested' ? stop(dispatch) : Promise.resolve(false)
  }

  /** Takes the steps one dispatch can take now, and stops at the first that cannot be taken. */
  return async function advance(tenant: TenantId, id: DispatchId): Promise<void> {
    for (let taken = 0; taken < MAX_STEPS; taken += 1) {
      const read = await store.dispatch(tenant, id)
      if (read.kind !== 'read' || read.value === null) return
      if (!(await stepOf(read.value))) return
    }
  }
}
