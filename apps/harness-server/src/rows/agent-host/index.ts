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
// Phase `business`, carried by the row body. The member has no ordered stop yet: it exposes no
// quiesce-all entry and does not inject `assemblyLifecycle`, and instances are released only when the
// fiber unloads. The handle therefore answers `incomplete` with that reason. It never answers
// `settled`, so the shutdown report stays honest until the member offers the entry.
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
import { defineRow, type RowBody } from '../../row.ts'

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

function bodyOf(input: AgentHostRowInput): RowBody {
  return async (ctx, config) => {
    const plugin = createAgentHostLocalPlugin({
      ...(input.toolRequestsOf === undefined ? {} : { toolRequests: input.toolRequestsOf(ctx) }),
      ...(input.measure === undefined ? {} : { measure: input.measure }),
    })
    await plugin.apply(ctx, config as AgentHostConfig)
    return {
      stop: () =>
        Promise.resolve({
          kind: 'incomplete',
          detail:
            'agent-host-local has no ordered stop: instances are released when the host fiber unloads',
        }),
    }
  }
}

/** The `agent-host` row over the given construction inputs. */
export function createAgentHostRow(input: AgentHostRowInput = {}) {
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
    body: bodyOf(input),
  })
}

/** The row without construction inputs: no Tool request source and no measurement observer. */
export const agentHostRow = createAgentHostRow()
