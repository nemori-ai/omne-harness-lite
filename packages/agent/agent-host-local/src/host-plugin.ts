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
  type LostContact,
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

export type AgentHostPlugin = DefinedPlugin<AgentHostConfig> &
  Readonly<{
    quiesceAll(input: AgentHostStopInput): Promise<AgentHostStopResult>
  }>

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
  readonly contact: Host['recovery']['contact']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.query = host.recovery.query
    this.load = host.recovery.load
    this.reconcile = host.recovery.reconcile
    this.detach = host.recovery.detach
    this.contact = host.recovery.contact
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

export function createAgentHostPlugin(
  factory: RuntimeFactory,
  options: Readonly<{ lostContact?: LostContact }> = {},
): AgentHostPlugin {
  const live = new Set<Host>()
  const receptions = new Map<Host, Reception>()
  const toolReceptions = new Map<Host, ToolReception>()
  const stopping = new WeakSet<Host>()
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
          entries: ctx.agentJournalEntries,
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
        principal: ctx.get('agentHostPrincipal'),
        ...(options.lostContact === undefined ? {} : { lostContact: options.lostContact }),
      })
      ctx.on('agent-cordis-contract/instance-retired', (tenant, instance, generation, reason) =>
        host.retired(tenant, instance, generation, reason),
      )
      live.add(host)
      const settings = config.reception ?? RECEPTION_INITIAL
      const log = (level: 'error' | 'warn' | 'info', message: string) => {
        try {
          ctx.logger('agent-host')[level](message)
        } catch {}
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
      for (const host of live) stopping.add(host)
      for (const reception of receptions.values()) reception.stop()
      for (const reception of toolReceptions.values()) reception.stop()
      return merged(await Promise.all([...live].map(host => host.quiesceAll(input))))
    },
  })
}

export const agentHostPlugin: AgentHostPlugin = createAgentHostPlugin(
  (dependencies, options, extras) => createAgentRuntime(dependencies, options, extras),
)

export type AgentHostLocalPluginInput = Readonly<{
  measure?: AgentMeasure
  toolRequests?: AgentDependencies<unknown, ContentBlock>['toolRequests']
  lostContact?: LostContact
}>

export function createAgentHostLocalPlugin(input: AgentHostLocalPluginInput = {}): AgentHostPlugin {
  const { measure, toolRequests, lostContact } = input
  return createAgentHostPlugin(
    (dependencies, options, extras) =>
      createAgentRuntime(
        toolRequests === undefined ? dependencies : { ...dependencies, toolRequests },
        options,
        measure === undefined ? extras : { ...extras, measure },
      ),
    lostContact === undefined ? {} : { lostContact },
  )
}
