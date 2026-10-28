import type {
  Access,
  AgentAccountHandoff,
  Failure,
  ReceivedCommitValue,
  Reply,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { maintenanceDenied, maintenanceUnavailable } from './receiving-scope.ts'
import { canonical } from './canonical.ts'
import type { ModelReceiverDependencies } from './receiving-types.ts'
import {
  bindingKey,
  diagnose,
  retainTask,
  tenantKey,
  type ModelReceiverState,
  type Reception,
} from './receiving-state.ts'

export function createReceptionOutlet<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
) {
  const driver = Symbol('receiver')
  state.driver = driver
  function enqueue(reception: Reception<P>, value: ReceivedCommitValue) {
    const delivery = reception.delivery
    const accounts =
      delivery.kind === 'result'
        ? delivery.accounts
        : [{ dispatch: delivery.key.dispatch, account: delivery.account }]
    for (const item of accounts) {
      if (item.account === null) continue
      const handoff: AgentAccountHandoff = {
        call: delivery.key.reference,
        dispatch: item.dispatch,
        account: item.account,
        resultVersion: delivery.kind === 'result' ? delivery.key.result : null,
        committed: value.saved,
      }
      const key = canonical([
        tenantKey(reception.access),
        handoff.call,
        handoff.dispatch,
        handoff.account.revision,
      ])
      const prior = state.outbound.get(key)
      if (prior) {
        if (canonical(prior.handoff.account) !== canonical(handoff.account))
          diagnose(
            state,
            key,
            'account revision conflict',
            bindingKey(reception.access, reception.target),
          )
        continue
      }
      state.outbound.set(key, {
        kind: 'pending',
        access: reception.access,
        target: reception.target,
        binding: reception.binding,
        handoff,
      })
    }
  }
  function drain(access: Access<P>, scope: ReadonlySet<string>, signal: AbortSignal): Reply<void> {
    // Freeze the workset before the first await. A new delivery belongs to a later drive.
    const items = [...state.outbound.entries()].filter(
      ([, item]) => item.kind === 'pending' && scope.has(item.binding),
    )
    const work = (async (): Reply<void> => {
      let qualificationFailure: Failure | undefined
      for (const [key, item] of items) {
        if (signal.aborted || state.driver !== driver) break
        if (state.outletTasks.has(key)) continue
        if (state.outbound.get(key)?.kind !== 'pending') continue
        const binding = item.binding
        // Reserve the task before authorization yields, so another driver cannot double-send.
        const task = (async () => {
          try {
            let allowed
            try {
              allowed = await dependencies.access.check({
                access,
                operation: 'receive-result',
                target: {
                  kind: 'execution',
                  instance: item.target.instance,
                  execution: item.target.execution,
                },
              })
            } catch (error) {
              qualificationFailure = maintenanceUnavailable('access')
              diagnose(state, key, String(error), binding)
              return
            }
            if (signal.aborted || state.driver !== driver) return
            if (allowed.kind !== 'allowed') {
              qualificationFailure =
                allowed.kind === 'denied' ? maintenanceDenied() : maintenanceUnavailable('access')
              diagnose(state, key, allowed, binding)
              return
            }
            state.outletActive.add(key)
            const result = await dependencies.outlet.deliver({
              access,
              handoff: structuredClone(item.handoff),
            })
            if (result.kind === 'received') {
              state.outbound.set(key, { ...item, kind: 'received' })
              state.diagnostics.delete(key)
            } else if (result.kind === 'unknown' || result.kind === 'unavailable')
              diagnose(state, key, result, binding)
            else {
              state.outbound.set(key, { ...item, kind: 'blocked', reason: result })
              diagnose(state, key, result, binding)
            }
          } catch (error) {
            diagnose(state, key, String(error), binding)
          }
        })()
        state.outletTasks.set(key, task)
        try {
          await task
        } finally {
          if (state.outletTasks.get(key) === task) {
            state.outletTasks.delete(key)
            state.outletActive.delete(key)
          }
        }
        if (qualificationFailure) return fail(qualificationFailure)
      }
      return succeed(undefined)
    })().catch(error => {
      diagnose(state, 'outlet-drive', String(error), null)
      return fail(maintenanceUnavailable('outlet-drive'))
    })
    return retainTask(state, work)
  }
  return { enqueue, drain }
}
