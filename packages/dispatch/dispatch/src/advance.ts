import {
  deliveryDue,
  settleSecondPlace,
  settleWait,
  type Delivery,
  type Dispatch,
  type DispatchEvent,
  type DispatchId,
  type SecondPlace,
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

const CREATED: DispatchEvent = { kind: 'session-created' }
const ARCHIVED: DispatchEvent = { kind: 'dispatcher-archived' }

/** Every step re-does the same thing under the same identity; an unknown result leaves the dispatch where it is. */
export function createAdvance(deps: AdvanceDependencies) {
  const { store, sessions, waits, clock } = deps

  const apply = (dispatch: Dispatch, event: DispatchEvent) =>
    store.apply(dispatch.tenant, { of: { id: dispatch.id }, event, at: clock.now() })

  const record = (dispatch: Dispatch, delivery: Exclude<Delivery, { kind: 'pending' }>) =>
    store.recordDelivery(dispatch.tenant, { id: dispatch.id, delivery, at: clock.now() })

  /** `accepted`: the session is created with the permission mode the dispatching session has now. */
  async function create(dispatch: Dispatch): Promise<unknown> {
    const row = await sessions.row(dispatch.tenant, dispatch.dispatcher)
    if (row.kind !== 'read') return undefined
    if (row.value === null || row.value.archived) return apply(dispatch, ARCHIVED)
    const { session } = dispatch
    const { permission } = row.value
    const answer = await sessions.create(dispatch.tenant, { session, dispatch, permission })
    if (answer.kind === 'unknown') return undefined
    const { kind } = answer
    return apply(
      dispatch,
      kind === 'created' ? CREATED : { kind: 'session-failed', detail: answer.detail },
    )
  }

  /** `started`: the end of the run the starting input started is the end of the dispatch. */
  async function follow(dispatch: Dispatch): Promise<unknown> {
    const fate = await sessions.startFate(dispatch.tenant, dispatch.session)
    const event = fate.kind === 'read' ? endOf(fate.value) : null
    return event === null ? undefined : apply(dispatch, event)
  }

  /** A send that was refused or has no known result records nothing: the next pass reads again. */
  async function sendReport(dispatch: Dispatch): Promise<unknown> {
    const answer = await sessions.send(dispatch.tenant, {
      to: dispatch.dispatcher,
      input: reportInputOf(dispatch.id),
      source: 'dispatch.report',
      text: dispatch.report?.text ?? '',
      from: { session: dispatch.session, agent: dispatch.agent },
    })
    return answer.kind === 'sent' ? record(dispatch, { kind: 'delivered', to: 'input' }) : undefined
  }

  async function secondPlace(dispatch: Dispatch): Promise<SecondPlace> {
    const { tenant, id, dispatcher } = dispatch
    const has = await sessions.has(tenant, dispatcher, reportInputOf(id))
    const row = await sessions.row(tenant, dispatcher)
    return {
      input: has.kind !== 'read' ? 'unknown' : has.value ? 'present' : 'absent',
      archived: row.kind !== 'read' ? 'unknown' : (row.value?.archived ?? true),
    }
  }

  /** An outcome goes to the wait; only when Tool answers that the wait is closed is the second place read. */
  async function handOver(dispatch: Dispatch): Promise<unknown> {
    const wait = await waits.hand(dispatch.tenant, dispatch, outcomeOf(dispatch))
    const first = settleWait(dispatch, wait)
    const step = first.kind === 'look' ? settleSecondPlace(await secondPlace(dispatch)) : first
    if (step.kind === 'record') return record(dispatch, step.delivery)
    return step.kind === 'send-input' ? sendReport(dispatch) : undefined
  }

  async function stop(dispatch: Dispatch): Promise<unknown> {
    const answer = await sessions.cancelStart(dispatch.tenant, dispatch.session)
    if (answer !== 'stopped') return undefined
    return store.confirmStop(dispatch.tenant, { id: dispatch.id, at: clock.now() })
  }

  function stepOf(dispatch: Dispatch): Promise<unknown> {
    if (dispatch.state === 'accepted') return create(dispatch)
    if (dispatch.state === 'started') return follow(dispatch)
    if (deliveryDue(dispatch)) return handOver(dispatch)
    return dispatch.stop === 'requested' ? stop(dispatch) : Promise.resolve()
  }

  async function current(tenant: TenantId, id: DispatchId): Promise<Dispatch | null> {
    const read = await store.dispatch(tenant, id)
    return read.kind === 'read' ? read.value : null
  }

  /** Takes one step after another while each one changes the dispatch, and stops at the first that does not. */
  return async function advance(tenant: TenantId, id: DispatchId): Promise<void> {
    let before: string | null = null
    for (;;) {
      const known = await current(tenant, id)
      if (known === null || known.changedAt === before) return
      before = known.changedAt
      await stepOf(known)
    }
  }
}
