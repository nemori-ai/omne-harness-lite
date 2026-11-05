// The Model result receiver of the `agent-host` plugin (SPEC "宿主插件", "结果接收"; R2-D237). The
// plugin body builds it from its injected services with `createLocalModelReceiver`, registers it
// with the Model runtime under the Agent's consumer owner (IC-13), and drives its maintenance:
//
// - The receiver state belongs to the host, not to one body: the plugin keeps one per Cordis root,
//   so a body that runs again over new providers hands the same state to the new receiver.
// - The registration is an effect of the plugin fiber, so it ends with the fiber. The ordered stop
//   removes it first, before it quiesces instances: the Model then keeps a later delivery owed
//   (`waiting`, `no-receiver`) instead of pushing it into a host that is stopping.
// - Maintenance (`reception-driver.ts`, R2-D250): an execution becomes known when a push of it
//   passed `receive-result`. A new receiver over a state that already holds pending work (a body
//   that runs again) knows the executions of that work, with the access their receptions kept. The
//   first run calls `recover` (the account backlog is rebuilt from the `received` entries).
import type { Context } from '@deepseek-ai/cordis'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import {
  createLocalModelReceiver,
  type AgentModelReceiver,
  type ModelReceiverDependencies,
  type ModelReceiverState,
} from './index.ts'
import { createReceptionDriver, type Log, type ReceptionSettings } from './reception-driver.ts'

export { RECEPTION_INITIAL, type ReceptionSettings } from './reception-driver.ts'

export type Reception = Readonly<{
  receiver: AgentModelReceiver<unknown>
  /** Removes the registration and stops the maintenance. Idempotent. */
  stop(): void
}>

/**
 * Builds the receiver over the injected services of `ctx`, registers it under the Agent consumer
 * owner and starts its maintenance. Throws what `registerResultReceiver` throws, a conflict with a
 * live registration included: that is an assembly error and fails the plugin fiber.
 */
export function startReception(
  input: Readonly<{
    ctx: Context
    state: ModelReceiverState<unknown>
    settings: ReceptionSettings
    log: Log
  }>,
): Reception {
  const { ctx, state, settings, log } = input
  let receiver: AgentModelReceiver<unknown> | undefined
  const driver = createReceptionDriver({
    clock: ctx.agentClock,
    settings,
    log,
    label: 'reception',
    receiver: () => {
      if (receiver === undefined) throw new Error('the Model receiver is not built yet')
      return receiver
    },
  })
  const models: ModelReceiverDependencies<unknown>['models'] = {
    inspect: query => ctx.modelRuntime.calls.inspect(query),
    dispatches: query => ctx.modelRuntime.calls.dispatches(query),
  }
  const capacity = Object.freeze({
    records: settings.records,
    bytes: settings.bytes,
    attachments: settings.attachments,
    inFlight: settings.inFlight,
  })
  const built = createLocalModelReceiver<unknown>(
    {
      provider: {
        journal: ctx.agentJournal,
        entries: ctx.agentJournalEntries,
        materials: ctx.agentMaterials,
        received: ctx.agentReceivedCommits,
      },
      access: driver.admitting(ctx.agentAccessCheck),
      targets: ctx.agentModelReceptionTargets,
      outlet: ctx.agentAccountOutlet,
      models,
      capacity: () => capacity,
    },
    state,
  )
  // `agentReceivedCommits` is a provided service, never null, so the factory supports it.
  if ('failure' in built) throw new Error('agent-host: the received commits port is unsupported')
  receiver = built.ok
  const removal = ctx.modelRuntime.registerResultReceiver(AGENT_CONSUMER_OWNER, receiver)
  // The executions whose work this state still holds, with the access their receptions kept.
  for (const item of state.outbound.values())
    if (item.kind === 'pending') driver.known(item.access, item.target.execution)
  for (const reception of state.receptions.values())
    if (reception.commit.kind === 'unknown')
      driver.known(reception.access, reception.target.execution)
  log('info', `reception: the Model result receiver is registered under ${AGENT_CONSUMER_OWNER}`)

  let stopped = false
  return {
    receiver,
    stop() {
      if (stopped) return
      stopped = true
      removal()
      driver.stop()
    },
  }
}
