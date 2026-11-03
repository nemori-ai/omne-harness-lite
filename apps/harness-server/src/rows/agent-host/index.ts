// The `agent-host` row: the local Agent host. The plugin is the one `createAgentHostLocalPlugin` of
// `@omne-harness/agent-host-local/cordis` makes from the two construction inputs of the row; the row
// body runs it in the row fiber, so its five faces (`agentInstanceHost` as well as the four the page
// lists) appear and end with the row. The row declares the fourteen injects of the assembly page.
// The plugin's own `inject` array holds eleven of them; `agentJournalEntries`, `agentMaterials` and
// `agentAccountOutlet` are the receiving keys that the page lists and the member does not inject
// yet, so the row keeps them as row injects and the host stays `PENDING` until they have providers.
//
// Construction inputs (runtime objects, never configuration, both optional):
// - `toolRequestsOf`: builds the trusted Tool request source (R2-D36) from the row context, so the
//   composition can read the services it projects at call time. Absent: the runtimes carry no
//   source and every Tool action answers `unavailable` (owner `agentToolRequests`). The production
//   composition is the Tool B segment's.
// - `measure`: the observer of the Agent measurement events (R2-D49), handed to every runtime.
//   Absent: no event is built.
//
// Phase `business`, carried by the row body. The handle's stop calls the member's ordered stop,
// `quiesceAll` of the plugin object (agent-host-local SPEC "有序停止"): admission closes, every
// instance is quiesced, and only drained ones unload. The member's answer maps as it is: `settled`
// to `settled`, `incomplete` to `incomplete` with the member's detail, which names each instance
// that did not drain and why. The deadline is the one the shutdown coordinator hands to the stop,
// on the monotonic clock of the shutdown; the row adds no time of its own. With the Agent factory
// of this release quiesce answers `unavailable` (#502 stage 5), so a stop with a live instance is
// `incomplete`; with no instance it is `settled`.
//
// Configuration (data only, no default; the operator layer gives every item): the factory items
// and `instanceIdleMs` that the member's schema judges, and one release rule on top (R2-D93): the
// Journal of this release is the session log, which commits the Agent's messages to the Session
// history only as the `message` joint commit, so `jointCommits` must list `message`. Without it a
// tool message would be committed as `none` and miss the history without an error (Agent
// public-api, the `jointCommits` row). A refused value fails the load.
import type { Context } from '@deepseek-ai/cordis'
import type { AgentMeasure } from '@omne-harness/agent'
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
  agentRequestsKey,
  agentAccountOutletKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { defineRow, type RowBody, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'

/** The host maintenance principal: a root object of the assembly entry with no service definition. */
const AGENT_HOST_PRINCIPAL = 'agentHostPrincipal'

/** The trusted Tool request source the member takes (R2-D36). */
export type AgentToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>

/** What the assembly hands to `createAgentHostRow`. Neither item is configuration. */
export type AgentHostRowInput = Readonly<{
  /** Builds the Tool request source from the row context. Absent: Tool actions answer unavailable. */
  toolRequestsOf?: (ctx: Context) => AgentToolRequests
  /** The observer of the Agent measurement events. Absent: no event is built. */
  measure?: AgentMeasure
}>

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

/** A signal that aborts at `deadline` on the shutdown's monotonic clock. */
function signalAt(deadline: number): AbortSignal {
  const left = deadline - monotonicClock.now()
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
      ...(input.measure === undefined ? {} : { measure: input.measure }),
    }),
  )
}

/** The row without construction inputs: no Tool request source and no measurement observer. */
export const agentHostRow = createAgentHostRow()
