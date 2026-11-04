// The `agent-host` plugin (docs/cordis.md "插件与入口"): one plugin body builds one host and provides
// its five faces on the plugin fiber, so they appear together and end together. The `inject` array
// is a literal of definition key constants. While one of them is absent the plugin stays PENDING and
// its body does not run; a wrong configuration fails the fiber before the body runs; a new provider
// of any of them unloads the body and runs it again, and the registrations of the old instances end
// with their contribution fibers.
//
// The plugin object also carries `quiesceAll`, the ordered stop of every host its bodies run now
// (SPEC "有序停止"). It is not a Cordis service: only the assembly that holds the plugin object can
// call it, so application members still have no way to stop an instance.
//
// The same body builds the Model result receiver outside every instance and registers it with the
// Model runtime under the Agent consumer owner (`reception.ts`, IC-13, R2-D237). Its state is kept
// per Cordis root, so a body that runs again hands the same state to its new receiver. The
// registration ends with the fiber; the ordered stop removes it before it quiesces instances.
//
// The body also mounts the child plugin `agent-host-tool-reception` (`tool-reception.ts`, R2-D273):
// it injects `toolRuntime` and `agentToolReceptionTargets`, so the host stays ready without the Tool
// rows, and it registers the Tool result receiver the same way, with its own state per root.
import type { Context } from '@deepseek-ai/cordis'
import {
  createAgentRuntime,
  createModelReceiverState,
  createToolReceiverState,
  type AgentDependencies,
  type AgentMeasure,
  type ModelReceiverState,
  type ToolReceiverState,
} from '@omne-harness/agent'
import type { AgentInstanceId } from '@omne-harness/agent-contract'
import {
  AgentExecutionControlService,
  AgentExecutionRecoveryService,
  AgentInstanceHostService,
  AgentInstanceProvisionService,
  AgentPublicationAuthorityService,
  agentAccessCheckKey,
  agentAccountOutletKey,
  agentAdoptionsKey,
  agentClockKey,
  agentConditionsKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentMessageHandoffKey,
  agentModelContextKey,
  agentModelReceptionTargetsKey,
  agentModelSelectionKey,
  agentReceivedCommitsKey,
  agentRequestsKey,
  type AgentLocalRoute,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { definePlugin, type DefinedPlugin } from '@omne-harness/kernel-basis/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { agentHostConfig, type AgentHostConfig } from './host-config.ts'
import {
  createHost,
  type AgentHostStopInput,
  type AgentHostStopResult,
  type AgentHostUnsettled,
  type Host,
  type RuntimeFactory,
} from './host.ts'
import { RECEPTION_INITIAL, startReception, type Reception } from './reception.ts'
import {
  TOOL_RECEPTION_INJECT,
  TOOL_RECEPTION_PLUGIN,
  startToolReception,
  type ToolReception,
} from './tool-reception.ts'

export type { AgentHostStopInput, AgentHostStopResult, AgentHostUnsettled }

/** The `agent-host` plugin and its ordered stop. */
export type AgentHostPlugin = DefinedPlugin<AgentHostConfig> &
  Readonly<{
    /**
     * Closes admission and quiesces every instance of every host the plugin's bodies run now. It
     * answers `settled` only when all of them drained before `signal` aborted; otherwise
     * `incomplete` names each instance or build that did not end, and why. It never rejects. With
     * no body running it answers `settled`: there is no instance to stop.
     */
    quiesceAll(input: AgentHostStopInput): Promise<AgentHostStopResult>
  }>

/** One answer for several hosts: settled only when every host settled. */
function merged(answers: readonly AgentHostStopResult[]): AgentHostStopResult {
  const left = answers.flatMap(answer => (answer.kind === 'settled' ? [] : [answer]))
  if (left.length === 0) return { kind: 'settled' }
  return {
    kind: 'incomplete',
    detail: left.map(answer => answer.detail).join('; '),
    instances: left.flatMap(answer => answer.instances),
  }
}

class LocalInstanceHost extends AgentInstanceHostService<unknown> {
  readonly reserve: Host['instanceHost']['reserve']
  readonly publish: Host['instanceHost']['publish']
  readonly withdraw: Host['instanceHost']['withdraw']
  readonly directory: Host['instanceHost']['directory']
  // A plain property: Cordis reaches the service through a proxy, which cannot read `#` fields.
  private readonly local: Host['instanceHost']

  constructor(ctx: Context, host: Host['instanceHost']) {
    super(ctx)
    this.local = host
    this.reserve = host.reserve
    this.publish = host.publish
    this.withdraw = host.withdraw
    this.directory = host.directory
  }

  route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<unknown> | null {
    return this.local.route(tenant, instance)
  }
}

class LocalPublicationAuthority extends AgentPublicationAuthorityService<unknown> {
  readonly check: Host['authority']['check']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.check = host.authority.check
  }
}

class LocalExecutionRecovery extends AgentExecutionRecoveryService<unknown> {
  readonly query: Host['recovery']['query']
  readonly load: Host['recovery']['load']
  readonly reconcile: Host['recovery']['reconcile']
  readonly detach: Host['recovery']['detach']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.query = host.recovery.query
    this.load = host.recovery.load
    this.reconcile = host.recovery.reconcile
    this.detach = host.recovery.detach
  }
}

class LocalExecutionControl extends AgentExecutionControlService<unknown> {
  readonly control: Host['control']['control']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.control = host.control.control
  }
}

class LocalInstanceProvision extends AgentInstanceProvisionService<unknown> {
  readonly acquire: Host['provision']['acquire']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.acquire = host.provision.acquire
  }
}

/**
 * The plugin over a given runtime factory. Production uses `createAgentRuntime`; a test may wrap
 * it, for example to stand in for a runtime duty that the factory does not keep yet.
 */
export function createAgentHostPlugin(factory: RuntimeFactory): AgentHostPlugin {
  const live = new Set<Host>()
  const receptions = new Map<Host, Reception>()
  const toolReceptions = new Map<Host, ToolReception>()
  // The hosts whose ordered stop began: a Tool reception child that runs later registers nothing.
  const stopping = new WeakSet<Host>()
  // The receiver states of the host, one per Cordis root: they outlive a body that runs again.
  const states = new WeakMap<object, ModelReceiverState<unknown>>()
  const toolStates = new WeakMap<object, ToolReceiverState<unknown>>()
  const stateOf = (ctx: Context): ModelReceiverState<unknown> => {
    const root = ctx.root as object
    let state = states.get(root)
    if (state === undefined) {
      state = createModelReceiverState<unknown>()
      states.set(root, state)
    }
    return state
  }
  const toolStateOf = (ctx: Context): ToolReceiverState<unknown> => {
    const root = ctx.root as object
    let state = toolStates.get(root)
    if (state === undefined) {
      state = createToolReceiverState<unknown>()
      toolStates.set(root, state)
    }
    return state
  }
  const plugin = definePlugin<AgentHostConfig>({
    name: 'agent-host',
    Config: agentHostConfig,
    inject: [
      agentAccessCheckKey,
      agentJournalKey,
      agentAdoptionsKey,
      agentConditionsKey,
      agentRequestsKey,
      agentModelSelectionKey,
      agentModelContextKey,
      agentMessageHandoffKey,
      agentClockKey,
      modelRuntimeKey,
      agentJournalEntriesKey,
      agentMaterialsKey,
      agentReceivedCommitsKey,
      agentModelReceptionTargetsKey,
      agentAccountOutletKey,
      'agentHostPrincipal',
    ],
    apply(ctx, config) {
      const host = createHost({
        ctx,
        config,
        factory,
        statics: {
          journal: ctx.agentJournal,
          access: ctx.agentAccessCheck,
          models: ctx.modelRuntime,
          adoptions: ctx.agentAdoptions,
          conditions: ctx.agentConditions,
          requests: ctx.agentRequests,
          selection: ctx.agentModelSelection,
          modelContext: ctx.agentModelContext,
          handoff: ctx.agentMessageHandoff,
          clock: ctx.agentClock,
        },
        // A runtime object provided at the root; it has no service definition to type it.
        principal: ctx.get('agentHostPrincipal'),
      })
      ctx.on('agent-cordis-contract/instance-retired', (tenant, instance, generation, reason) =>
        host.retired(tenant, instance, generation, reason),
      )
      live.add(host)
      const settings = config.reception ?? RECEPTION_INITIAL
      const log = (level: 'error' | 'warn' | 'info', message: string) => {
        try {
          ctx.logger('agent-host')[level](message)
        } catch {
          // The context has ended; there is nobody to tell.
        }
      }
      const reception = startReception({ ctx, state: stateOf(ctx), settings, log })
      receptions.set(host, reception)
      ctx.effect(
        () => () => {
          live.delete(host)
          receptions.delete(host)
          reception.stop()
          toolReceptions.get(host)?.stop()
          toolReceptions.delete(host)
          host.stop()
        },
        'agent-host.stop',
      )
      ctx.plugin({
        name: TOOL_RECEPTION_PLUGIN,
        inject: [...TOOL_RECEPTION_INJECT],
        apply(child: Context) {
          // After an ordered stop the host takes no Tool result: the delivery stays owed.
          if (!live.has(host) || stopping.has(host)) return
          const tool = startToolReception({
            parent: ctx,
            child,
            state: toolStateOf(ctx),
            settings,
            log,
          })
          toolReceptions.set(host, tool)
          child.effect(
            () => () => {
              tool.stop()
              if (toolReceptions.get(host) === tool) toolReceptions.delete(host)
            },
            'agent-host.tool-reception.stop',
          )
        },
      })
      new LocalInstanceHost(ctx, host.instanceHost)
      new LocalPublicationAuthority(ctx, host)
      new LocalExecutionRecovery(ctx, host)
      new LocalExecutionControl(ctx, host)
      new LocalInstanceProvision(ctx, host)
    },
  })
  return Object.assign(plugin, {
    async quiesceAll(input: AgentHostStopInput): Promise<AgentHostStopResult> {
      // The receivers go first: from now on Model and Tool keep a delivery owed, not pushed here.
      for (const host of live) stopping.add(host)
      for (const reception of receptions.values()) reception.stop()
      for (const reception of toolReceptions.values()) reception.stop()
      return merged(await Promise.all([...live].map(host => host.quiesceAll(input))))
    },
  })
}

/** The `agent-host` plugin with the Agent factory. */
export const agentHostPlugin: AgentHostPlugin = createAgentHostPlugin(
  (dependencies, options, extras) => createAgentRuntime(dependencies, options, extras),
)

/** What the assembly entry hands to `createAgentHostLocalPlugin`. */
export type AgentHostLocalPluginInput = Readonly<{
  /**
   * The observer of the Agent measurement events, handed to `createAgentRuntime` for every runtime
   * this host builds (Agent SPEC「测量事件」). It is a function, so it is not a configuration
   * member. Absent: no event is built, as with `agentHostPlugin`.
   */
  measure?: AgentMeasure
  /**
   * The trusted source of Tool requests (R2-D36), put into the dependencies of every runtime this
   * host builds. It is the host's construction dependency: a function object, not a configuration
   * member and not a service key. Absent: the dependencies carry none, so each Tool action answers
   * `unavailable` as with `agentHostPlugin`.
   */
  toolRequests?: AgentDependencies<unknown, ContentBlock>['toolRequests']
}>

/**
 * The `agent-host` plugin with the construction dependencies that the assembly entry hands in: the
 * measurement observer and the Tool request source. The name, `inject`, configuration and provided
 * keys are those of `agentHostPlugin`; neither is a Cordis service or a configuration member. Use
 * the returned plugin as `ctx.plugin(plugin, config)` does with `agentHostPlugin`.
 */
export function createAgentHostLocalPlugin(input: AgentHostLocalPluginInput = {}): AgentHostPlugin {
  const { measure, toolRequests } = input
  return createAgentHostPlugin((dependencies, options, extras) =>
    createAgentRuntime(
      toolRequests === undefined ? dependencies : { ...dependencies, toolRequests },
      options,
      measure === undefined ? extras : { ...extras, measure },
    ),
  )
}
