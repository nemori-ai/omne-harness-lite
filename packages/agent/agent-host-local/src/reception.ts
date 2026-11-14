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
  stop(): void
}>

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
  if ('failure' in built) throw new Error('agent-host: the received commits port is unsupported')
  receiver = built.ok
  const removal = ctx.modelRuntime.registerResultReceiver(AGENT_CONSUMER_OWNER, receiver)
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
