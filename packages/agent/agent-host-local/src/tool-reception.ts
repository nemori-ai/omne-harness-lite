import type { Context } from '@deepseek-ai/cordis'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import { agentToolReceptionTargetsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolReceiver, type AgentToolReceiver, type ToolReceiverState } from './index.ts'
import { createReceptionDriver, type Log, type ReceptionSettings } from './reception-driver.ts'

export const TOOL_RECEPTION_PLUGIN = 'agent-host-tool-reception'

export type ToolReception = Readonly<{
  receiver: AgentToolReceiver<unknown>
  stop(): void
}>

export function startToolReception(
  input: Readonly<{
    parent: Context
    child: Context
    state: ToolReceiverState<unknown>
    settings: ReceptionSettings
    log: Log
  }>,
): ToolReception {
  const { parent, child, state, settings, log } = input
  let receiver: AgentToolReceiver<unknown> | undefined
  const driver = createReceptionDriver({
    clock: parent.agentClock,
    settings,
    log,
    label: 'tool reception',
    receiver: () => {
      if (receiver === undefined) throw new Error('the Tool receiver is not built yet')
      return receiver
    },
  })
  const capacity = Object.freeze({
    records: settings.records,
    bytes: settings.bytes,
    attachments: settings.attachments,
    inFlight: settings.inFlight,
  })
  const built = createLocalToolReceiver<unknown>(
    {
      provider: {
        journal: parent.agentJournal,
        entries: parent.agentJournalEntries,
        materials: parent.agentMaterials,
        received: parent.agentReceivedCommits,
      },
      access: driver.admitting(parent.agentAccessCheck),
      targets: child.agentToolReceptionTargets,
      capacity: () => capacity,
    },
    state,
  )
  if ('failure' in built) throw new Error('agent-host: the received commits port is unsupported')
  receiver = built.ok
  const removal = child.toolRuntime.registerResultReceiver(AGENT_CONSUMER_OWNER, receiver)
  for (const reception of state.receptions.values())
    if (reception.commit.kind === 'unknown')
      driver.known(reception.access, reception.target.execution)
  log(
    'info',
    `tool reception: the Tool result receiver is registered under ${AGENT_CONSUMER_OWNER}`,
  )

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

export const TOOL_RECEPTION_INJECT = [toolRuntimeKey, agentToolReceptionTargetsKey] as const
