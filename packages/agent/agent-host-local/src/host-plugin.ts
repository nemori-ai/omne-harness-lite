// The `agent-host` plugin (docs/cordis.md "插件与入口"): one plugin body builds one host and provides
// its five faces on the plugin fiber, so they appear together and end together. The `inject` array
// is a literal of definition key constants. While one of them is absent the plugin stays PENDING and
// its body does not run; a wrong configuration fails the fiber before the body runs; a new provider
// of any of them unloads the body and runs it again, and the registrations of the old instances end
// with their contribution fibers.
import type { Context } from '@deepseek-ai/cordis'
import { createAgentRuntime, type AgentDependencies, type AgentMeasure } from '@omne-harness/agent'
import type { AgentInstanceId } from '@omne-harness/agent-contract'
import {
  AgentExecutionControlService,
  AgentExecutionRecoveryService,
  AgentInstanceHostService,
  AgentInstanceProvisionService,
  AgentPublicationAuthorityService,
  agentAccessCheckKey,
  agentAdoptionsKey,
  agentClockKey,
  agentConditionsKey,
  agentJournalKey,
  agentMessageHandoffKey,
  agentModelContextKey,
  agentModelSelectionKey,
  agentRequestsKey,
  type AgentLocalRoute,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { definePlugin } from '@omne-harness/kernel-basis/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { agentHostConfig, type AgentHostConfig } from './host-config.ts'
import { createHost, type Host, type RuntimeFactory } from './host.ts'

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
export function createAgentHostPlugin(factory: RuntimeFactory) {
  return definePlugin<AgentHostConfig>({
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
      ctx.effect(() => () => host.stop(), 'agent-host.stop')
      new LocalInstanceHost(ctx, host.instanceHost)
      new LocalPublicationAuthority(ctx, host)
      new LocalExecutionRecovery(ctx, host)
      new LocalExecutionControl(ctx, host)
      new LocalInstanceProvision(ctx, host)
    },
  })
}

/** The `agent-host` plugin with the Agent factory. */
export const agentHostPlugin = createAgentHostPlugin((dependencies, options) =>
  createAgentRuntime(dependencies, options),
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
export function createAgentHostLocalPlugin(input: AgentHostLocalPluginInput = {}) {
  const { measure, toolRequests } = input
  return createAgentHostPlugin((dependencies, options) =>
    createAgentRuntime(
      toolRequests === undefined ? dependencies : { ...dependencies, toolRequests },
      options,
      measure === undefined ? {} : { measure },
    ),
  )
}
