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
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentMessageHandoffKey,
  agentModelContextKey,
  agentModelSelectionKey,
  agentPublicationAuthorityKey,
  agentReceivedCommitsKey,
  agentModelReceptionTargetsKey,
  agentRequestsKey,
  agentAccountOutletKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { defineRow, type RowBody, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { processInstance } from '../telemetry/instance.ts'

const AGENT_HOST_PRINCIPAL = 'agentHostPrincipal'

export type AgentToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>

export type AgentHostRowInput = Readonly<{
  toolRequestsOf?: (ctx: Context) => AgentToolRequests
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
        agentInstanceProvisionKey,
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
        agentModelSelectionKey,
        agentModelContextKey,
        agentMessageHandoffKey,
        agentAccountOutletKey,
        modelRuntimeKey,
        agentClockKey,
        AGENT_HOST_PRINCIPAL,
        telemetryKey,
      ],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'body', phase: 'business' },
    Config: agentHostRowConfig,
    body: bodyOver(pluginOf),
  })
}

export function createAgentHostRow(input: AgentHostRowInput = {}) {
  return createAgentHostRowOver(ctx =>
    createAgentHostLocalPlugin({
      ...(input.toolRequestsOf === undefined ? {} : { toolRequests: input.toolRequestsOf(ctx) }),
      measure: input.measure ?? agentMeasureOf(ctx),
      ...(input.lostContact === undefined ? {} : { lostContact: input.lostContact }),
    }),
  )
}

export const agentHostRow = createAgentHostRow()
