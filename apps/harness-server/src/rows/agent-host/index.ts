// The `agent-host` row: the local Agent host. The plugin is the one `createAgentHostLocalPlugin` of
// `@omne-harness/agent-host-local/cordis` makes from the two construction inputs of the row; the row
// body runs it in the row fiber, so its five faces (`agentInstanceHost` as well as the four the page
// lists) appear and end with the row. The row declares the sixteen injects of the plugin's own
// `inject` array, the fourteen of the assembly page and the two faces of the Model result receiver
// that the `agent-journal` row provides, `agentReceivedCommits` and `agentModelReceptionTargets`
// (R2-D237), and one of its own, `telemetry` (D04: required, so a tree without the row does not
// serve). The plugin body builds the receiver from them and registers it with `modelRuntime`
// under the Agent consumer owner; the registration ends with the row fiber, and the ordered stop
// below removes it first. The plugin body also mounts its Tool reception child (R2-D273): it injects
// `toolRuntime` and `agentToolReceptionTargets` (the `agent-journal` row provides the latter) and
// registers the Tool result receiver with the Tool runtime the same way. The child is not in the
// row's injects: without the Tool rows it stays PENDING and the row is ready all the same.
//
// Construction inputs (runtime objects, never configuration, both optional):
// - `toolRequestsOf`: builds the trusted Tool request source (R2-D36) from the row context, so the
//   composition can read the services it projects at call time. Absent: the runtimes carry no
//   source and every Tool action answers `unavailable` (owner `agentToolRequests`). The production
//   composition is the Tool B segment's.
// - `measure`: the observer of the Agent measurement events (R2-D49), handed to every runtime.
//   Absent: the row's own facade over the injected `telemetry`, which turns each pass of an
//   execution into a segment `omne.agent.pass.<pass>` scoped to the tenant of the execution; the
//   member does not know the telemetry key.
//
// Phase `business`, carried by the row body. The handle's stop calls the member's ordered stop,
// `quiesceAll` of the plugin object (agent-host-local SPEC "有序停止"): the registrations of the
// Model and the Tool result receiver are removed, admission closes, every
// instance is quiesced, and only drained ones unload. The member's answer maps as it is: `settled`
// to `settled`, `incomplete` to `incomplete` with the member's detail, which names each instance
// that did not drain and why. The deadline is the one the shutdown coordinator hands to the stop,
// on the monotonic clock of the shutdown; the row adds no time of its own. With the Agent factory
// of this release quiesce drains an idle instance and answers `unresolved` for an execution in its
// slot (R2-D173, R2-D185; its handover is #502 stage 5), so a stop is `settled` with no instance or
// only idle ones, and `incomplete` when an execution holds a slot.
//
// Configuration (data only, no default; the operator layer gives every item): the factory items
// and `instanceIdleMs` that the member's schema judges, and one release rule on top (R2-D93): the
// Journal of this release is the session log, which commits the Agent's messages to the Session
// history only as the `message` joint commit, so `jointCommits` must list `message`. Without it a
// tool message would be committed as `none` and miss the history without an error (Agent
// public-api, the `jointCommits` row). A refused value fails the load.
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
import { FACADE_MAX_OPEN_SEGMENTS } from '../telemetry/config.ts'
import { processInstance } from '../telemetry/instance.ts'

/** The host maintenance principal: a root object of the assembly entry with no service definition. */
const AGENT_HOST_PRINCIPAL = 'agentHostPrincipal'

/** The trusted Tool request source the member takes (R2-D36). */
export type AgentToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>

/** What the assembly hands to `createAgentHostRow`. Neither item is configuration. */
export type AgentHostRowInput = Readonly<{
  /** Builds the Tool request source from the row context. Absent: Tool actions answer unavailable. */
  toolRequestsOf?: (ctx: Context) => AgentToolRequests
  /** The observer of the Agent measurement events. Absent: the row's facade over `telemetry`. */
  measure?: AgentMeasure
}>

/** The row's own observer: the Agent telemetry facade over the injected `telemetry`. */
function agentMeasureOf(ctx: Context): AgentMeasure {
  return createAgentTelemetry(ctx.telemetry, {
    instance: processInstance,
    maxOpenSegments: FACADE_MAX_OPEN_SEGMENTS,
  }).measure
}

/** The joint commit the session-log Journal needs to put Agent messages into the history. */
const REQUIRED_JOINT_COMMIT = 'message'

type Issue = Readonly<{ message: string }>
type Judged =
  | { issues?: never; value: AgentHostConfig }
  | { value?: never; issues: readonly Issue[] }

// The member's schema: `agentHostPlugin` and every plugin `createAgentHostLocalPlugin` makes share it.
const memberSchema = agentHostPlugin.Config as unknown as {
  '~standard': { validate(value: unknown): Judged }
}

/** The row's Standard Schema: the member's check, then the release rule on `jointCommits`. */
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

/** A signal that aborts at `deadline` on the shutdown's monotonic clock (whole ms, rounded up). */
function signalAt(deadline: number): AbortSignal {
  const left = Math.ceil(deadline - monotonicClock.now())
  return left > 0 ? AbortSignal.timeout(left) : AbortSignal.abort()
}

/** The row handle over the plugin the body runs: its stop is the member's ordered stop. */
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

/**
 * The `agent-host` row over any plugin with the member's ordered stop. `createAgentHostRow` gives it
 * the member's local plugin; a test gives it the plugin of `@omne-harness/agent-host-local/testing`
 * to stand in for runtime duties the Agent factory does not keep yet.
 */
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

/** The `agent-host` row over the given construction inputs. */
export function createAgentHostRow(input: AgentHostRowInput = {}) {
  return createAgentHostRowOver(ctx =>
    createAgentHostLocalPlugin({
      ...(input.toolRequestsOf === undefined ? {} : { toolRequests: input.toolRequestsOf(ctx) }),
      measure: input.measure ?? agentMeasureOf(ctx),
    }),
  )
}

/** The row without construction inputs: no Tool request source; the telemetry facade measures. */
export const agentHostRow = createAgentHostRow()
