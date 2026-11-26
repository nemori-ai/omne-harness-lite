import type { Context, Plugin } from '@deepseek-ai/cordis'
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
  AgentNestedActionsService,
  AgentExecutionRecoveryService,
  AgentInstanceHostService,
  AgentInstanceProvisionService,
  AgentPublicationAuthorityService,
  agentAccessCheckKey,
  agentAdoptionsKey,
  agentClockKey,
  agentConditionsKey,
  agentCompactionKey,
  agentCompactionInputsKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentMessageHandoffKey,
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
    startReceiving(): void
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
  readonly handOver: Host['recovery']['handOver']
  readonly contact: Host['recovery']['contact']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.query = host.recovery.query
    this.load = host.recovery.load
    this.reconcile = host.recovery.reconcile
    this.detach = host.recovery.detach
    this.handOver = host.recovery.handOver
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

class LocalNestedActions extends AgentNestedActionsService<unknown> {
  readonly admit: Host['nested']['admit']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.admit = host.nested.admit
  }
}

class LocalInstanceProvision extends AgentInstanceProvisionService<unknown> {
  readonly acquire: Host['provision']['acquire']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    this.acquire = host.provision.acquire
  }
}

/** A host that waits to receive keeps what begins its receptions until it is told to; one that does not wait begins at once. */
function deferral<H>(defer: boolean) {
  const waiting = new Map<H, (() => void)[]>()
  return {
    hold: (host: H): void => void (defer && waiting.set(host, [])),
    drop: (host: H): void => void waiting.delete(host),
    run(host: H, begin: () => void): void {
      const held = waiting.get(host)
      if (held === undefined) begin()
      else held.push(begin)
    },
    release(): void {
      const held = [...waiting.values()].flat()
      waiting.clear()
      for (const begin of held) begin()
    },
  }
}

function toolReceptionChild(
  host: Readonly<{
    open(): boolean
    begin(start: () => void): void
    start(child: Context): ToolReception
    started(tool: ToolReception): void
    stopped(tool: ToolReception): void
  }>,
): Plugin.Object {
  return {
    name: TOOL_RECEPTION_PLUGIN,
    inject: [...TOOL_RECEPTION_INJECT],
    apply(child: Context) {
      if (!host.open()) return
      let tool: ToolReception | undefined
      let left = false
      host.begin(() => {
        if (left || !host.open()) return
        tool = host.start(child)
        host.started(tool)
      })
      child.effect(
        () => () => {
          left = true
          tool?.stop()
          if (tool !== undefined) host.stopped(tool)
        },
        'agent-host.tool-reception.stop',
      )
    },
  }
}

export function createAgentHostPlugin(
  factory: RuntimeFactory,
  options: Readonly<{ lostContact?: LostContact; deferReception?: boolean }> = {},
): AgentHostPlugin {
  const live = new Set<Host>()
  const deferred = deferral<Host>(options.deferReception === true)
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
      agentCompactionKey,
      agentCompactionInputsKey,
      agentModelSelectionKey,
      agentMessageHandoffKey,
      agentClockKey,
      modelRuntimeKey,
      agentJournalEntriesKey,
      agentMaterialsKey,
      agentReceivedCommitsKey,
      agentModelReceptionTargetsKey,
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
          compaction: ctx.agentCompaction,
          compactionInputs: ctx.agentCompactionInputs,
          received: ctx.agentReceivedCommits,
          selection: ctx.agentModelSelection,
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
      deferred.hold(host)
      const settings = config.reception ?? RECEPTION_INITIAL
      const log = (level: 'error' | 'warn' | 'info', message: string) => {
        try {
          ctx.logger('agent-host')[level](message)
        } catch {}
      }
      deferred.run(host, () => {
        if (!live.has(host) || stopping.has(host)) return
        receptions.set(host, startReception({ ctx, state: stateOf(ctx), settings, log }))
      })
      ctx.effect(
        () => () => {
          live.delete(host)
          deferred.drop(host)
          receptions.get(host)?.stop()
          receptions.delete(host)
          toolReceptions.get(host)?.stop()
          toolReceptions.delete(host)
          host.stop()
        },
        'agent-host.stop',
      )
      ctx.plugin(
        toolReceptionChild({
          // After an ordered stop the host takes no Tool result: the delivery stays owed.
          open: () => live.has(host) && !stopping.has(host),
          begin: start => deferred.run(host, start),
          start: child =>
            startToolReception({ parent: ctx, child, state: toolStateOf(ctx), settings, log }),
          started: tool => void toolReceptions.set(host, tool),
          stopped: tool => {
            if (toolReceptions.get(host) === tool) toolReceptions.delete(host)
          },
        }),
      )
      new LocalInstanceHost(ctx, host.instanceHost)
      new LocalPublicationAuthority(ctx, host)
      new LocalExecutionRecovery(ctx, host)
      new LocalExecutionControl(ctx, host)
      new LocalNestedActions(ctx, host)
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
    startReceiving: deferred.release,
  })
}

export const agentHostPlugin: AgentHostPlugin = createAgentHostPlugin(
  (dependencies, options, extras) => createAgentRuntime(dependencies, options, extras),
)

export type AgentHostLocalPluginInput = Readonly<{
  measure?: AgentMeasure
  toolRequests?: AgentDependencies<unknown, ContentBlock>['toolRequests']
  /** The tenant source of enabled loop extensions. Without it an extension chain has no tenant members. */
  enabledExtensions?: AgentDependencies<unknown, ContentBlock>['enabledExtensions']
  /** The trusted system extensions of the assembly. Without it an extension chain has no system members. */
  systemExtensions?: AgentDependencies<unknown, ContentBlock>['systemExtensions']
  lostContact?: LostContact
  /** The host takes no result until `startReceiving`: a generation that stands by beside the one that serves. */
  deferReception?: boolean
}>

export function createAgentHostLocalPlugin(input: AgentHostLocalPluginInput = {}): AgentHostPlugin {
  const { measure, toolRequests, enabledExtensions, systemExtensions, lostContact } = input
  const supplied = {
    ...(toolRequests === undefined ? {} : { toolRequests }),
    ...(enabledExtensions === undefined ? {} : { enabledExtensions }),
    ...(systemExtensions === undefined ? {} : { systemExtensions }),
  }
  return createAgentHostPlugin(
    (dependencies, options, extras) =>
      createAgentRuntime(
        { ...dependencies, ...supplied },
        options,
        measure === undefined ? extras : { ...extras, measure },
      ),
    {
      ...(lostContact === undefined ? {} : { lostContact }),
      ...(input.deferReception === undefined ? {} : { deferReception: input.deferReception }),
    },
  )
}
