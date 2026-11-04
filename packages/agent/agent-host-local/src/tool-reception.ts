// The Tool result receiver of the `agent-host` plugin (SPEC "结果接收", R2-D273). It is the Tool
// counterpart of `reception.ts`: the plugin body mounts the child plugin `agent-host-tool-reception`,
// which injects `toolRuntime` and `agentToolReceptionTargets`, builds the receiver with
// `createLocalToolReceiver` over the parent's Journal provider and access check, registers it with
// the Tool runtime under the Agent consumer owner (IC-13), and drives its maintenance
// (`reception-driver.ts`, R2-D250).
//
// - A child fiber, so the host stays ready without the Tool rows: until both keys are there the
//   child is PENDING and the Tool runtime keeps a delivery owed. Tool is a local dependency of the
//   host (assembly page: `toolRuntime` is taken at the tool stage).
// - The receiver state belongs to the host, one per Cordis root, so a child or a body that runs
//   again hands the same state to its new receiver, and that receiver drives the receptions that
//   the state still holds unknown.
// - The registration is an effect of the child fiber and ends with it. The ordered stop removes it
//   first, before it quiesces instances.
import type { Context } from '@deepseek-ai/cordis'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import { agentToolReceptionTargetsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolReceiver, type AgentToolReceiver, type ToolReceiverState } from './index.ts'
import { createReceptionDriver, type Log, type ReceptionSettings } from './reception-driver.ts'

export const TOOL_RECEPTION_PLUGIN = 'agent-host-tool-reception'

export type ToolReception = Readonly<{
  receiver: AgentToolReceiver<unknown>
  /** Removes the registration and stops the maintenance. Idempotent. */
  stop(): void
}>

/**
 * Builds the Tool receiver in the child fiber `child`, over the services that the parent body
 * injected (`parent`), registers it with `child.toolRuntime` and starts its maintenance. Throws
 * what `registerResultReceiver` throws: a live registration of the same owner is an assembly error
 * and fails the child fiber.
 */
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
  // `agentReceivedCommits` is a provided service, never null, so the factory supports it.
  if ('failure' in built) throw new Error('agent-host: the received commits port is unsupported')
  receiver = built.ok
  const removal = child.toolRuntime.registerResultReceiver(AGENT_CONSUMER_OWNER, receiver)
  // The executions whose commit this state still holds unknown, with the access of that push.
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

/** The inject of the child plugin: the Tool runtime and the Tool target query. */
export const TOOL_RECEPTION_INJECT = [toolRuntimeKey, agentToolReceptionTargetsKey] as const
