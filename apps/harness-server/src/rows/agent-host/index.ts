import type { Context } from '@deepseek-ai/cordis'
import { createAgentTelemetry, type AgentMeasure } from '@omne-harness/agent'
import {
  agentHostPlugin,
  createAgentHostLocalPlugin,
  type AgentHostConfig,
  type AgentHostLocalPluginInput,
  type AgentHostPlugin,
} from '@omne-harness/agent-host-local/cordis'
import {
  agentAccessCheckKey,
  agentAdoptionsKey,
  agentClockKey,
  agentConditionsKey,
  agentCompactionKey,
  agentCompactionInputsKey,
  agentExecutionControlKey,
  agentNestedActionsKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentMessageHandoffKey,
  agentModelSelectionKey,
  agentPublicationAuthorityKey,
  agentReceivedCommitsKey,
  agentModelReceptionTargetsKey,
  agentRequestsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { toolProgramAdmissionKey } from '@omne-harness/tool-cordis-contract/cordis'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { defineRow, type RowBody, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { processInstance } from '../telemetry/instance.ts'
import { agentHostEntries } from './entries.ts'
import { ReleaseProgramAdmission } from './program-admission.ts'

const AGENT_HOST_PRINCIPAL = 'agentHostPrincipal'

export type AgentToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>

export type AgentHostRowInput = Readonly<{
  toolRequestsOf?: (ctx: Context) => AgentToolRequests
  enabledExtensionsOf?: (
    ctx: Context,
  ) => NonNullable<AgentHostLocalPluginInput['enabledExtensions']>
  systemExtensionsOf?: (ctx: Context) => NonNullable<AgentHostLocalPluginInput['systemExtensions']>
  measure?: AgentMeasure
  lostContact?: NonNullable<AgentHostLocalPluginInput['lostContact']>
}>

function agentMeasureOf(ctx: Context): AgentMeasure {
  return createAgentTelemetry(ctx.telemetry, { instance: processInstance }).measure
}

const REQUIRED_JOINT_COMMIT = 'message'

type Issue = Readonly<{ message: string }>
type Judged =
  | { issues?: never; value: AgentHostConfig }
  | { value?: never; issues: readonly Issue[] }

const memberSchema = agentHostPlugin.Config as unknown as {
  '~standard': { validate(value: unknown): Judged }
}

export const agentHostRowConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'harness-server/agent-host',
    validate(value: unknown): Judged {
      const judged = memberSchema['~standard'].validate(value)
      if (judged.issues !== undefined) return judged
      if (!judged.value.jointCommits.includes(REQUIRED_JOINT_COMMIT))
        return {
          issues: [
            {
              message:
                'jointCommits: the session-log Journal of this release needs `message` (R2-D93)',
            },
          ],
        }
      return judged
    },
  },
}

function signalAt(deadline: number): AbortSignal {
  const left = Math.ceil(deadline - monotonicClock.now())
  return left > 0 ? AbortSignal.timeout(left) : AbortSignal.abort()
}

function handleOf(plugin: AgentHostPlugin): RowHandle {
  return {
    // The host receives results from its start on: a generation that stands by does not hold the receivers.
    start: async () => plugin.startReceiving(),
    async stop(deadline) {
      const answer = await plugin.quiesceAll({ signal: signalAt(deadline) })
      return answer.kind === 'settled'
        ? { kind: 'settled' }
        : { kind: 'incomplete', detail: answer.detail }
    },
  }
}

function bodyOver(pluginOf: (ctx: Context) => AgentHostPlugin): RowBody {
  return async (ctx, config) => {
    const plugin = pluginOf(ctx)
    await plugin.apply(ctx, config as AgentHostConfig)
    new ReleaseProgramAdmission(ctx)
    return handleOf(plugin)
  }
}

export function createAgentHostRowOver(pluginOf: (ctx: Context) => AgentHostPlugin) {
  return defineRow({
    row: 'agent-host',
    implementation: 'real',
    manifest: {
      provides: [
        agentPublicationAuthorityKey,
        agentExecutionRecoveryKey,
        agentExecutionControlKey,
        agentNestedActionsKey,
        agentInstanceProvisionKey,
        toolProgramAdmissionKey,
      ],
      injects: [
        agentJournalKey,
        agentJournalEntriesKey,
        agentMaterialsKey,
        agentReceivedCommitsKey,
        agentModelReceptionTargetsKey,
        agentAccessCheckKey,
        agentAdoptionsKey,
        agentConditionsKey,
        agentRequestsKey,
        agentCompactionKey,
        agentCompactionInputsKey,
        agentModelSelectionKey,
        agentMessageHandoffKey,
        modelRuntimeKey,
        agentClockKey,
        AGENT_HOST_PRINCIPAL,
        telemetryKey,
      ],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'body', phase: 'business' },
    swap: 'implementation',
    entries: agentHostEntries(),
    Config: agentHostRowConfig,
    body: bodyOver(pluginOf),
  })
}

export function createAgentHostRow(input: AgentHostRowInput = {}) {
  return createAgentHostRowOver(ctx =>
    createAgentHostLocalPlugin({
      ...(input.toolRequestsOf === undefined ? {} : { toolRequests: input.toolRequestsOf(ctx) }),
      ...(input.enabledExtensionsOf === undefined
        ? {}
        : { enabledExtensions: input.enabledExtensionsOf(ctx) }),
      ...(input.systemExtensionsOf === undefined
        ? {}
        : { systemExtensions: input.systemExtensionsOf(ctx) }),
      measure: input.measure ?? agentMeasureOf(ctx),
      deferReception: true,
      ...(input.lostContact === undefined ? {} : { lostContact: input.lostContact }),
    }),
  )
}

export const agentHostRow = createAgentHostRow()
