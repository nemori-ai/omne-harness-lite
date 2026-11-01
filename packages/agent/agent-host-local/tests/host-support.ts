// The world of the host tests: a real Cordis 4.0.4 root that provides every service the `agent-host`
// plugin injects, the directory plugin of agent-cordis-contract, and the host plugin itself. The
// services are the non-durable doubles of `@omne-harness/agent/testing` behind Service subclasses of
// the definition entry; nothing here proves a real provider, durability or another process.
//
// `withRuntimeDuties` wraps the Agent factory with the two runtime duties of XC-AGINST 3.5 that
// `createAgentRuntime` does not keep yet: quiesce marks the runtime draining before its first
// `await` and withdraws through the registration handle, and invoke reports `occupied` in the same
// step that takes the slot. Tests that use it prove the host side only; tests that use the plain
// factory show what the real runtime answers today.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { createAgentRuntime } from '@omne-harness/agent'
import { createTestAgentDependencies, type TestAgentControls } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeExecutionAttachmentId,
  type Access,
  type AgentInstanceId,
  type AgentRegistrationHandle,
  type AgentState,
  type Failure,
} from '@omne-harness/agent-contract'
import {
  AgentAccessCheckService,
  AgentAdoptionsService,
  AgentClockService,
  AgentJournalService,
  CurrentConditionsService,
  MessageHandoffService,
  ModelContextReaderService,
  ModelSelectionService,
  RequestPreparationService,
  agentInstancesPlugin,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { AgentInstanceSlotInput } from '@omne-harness/agent-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { ModelRuntimeService } from '@omne-harness/model-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentHostConfig } from '../src/host-config.ts'
import { createAgentHostPlugin } from '../src/host-plugin.ts'
import type { RuntimeFactory } from '../src/host.ts'

export type Principal = string

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

export const tenants: Readonly<Record<'a' | 'b', TenantId>> = {
  a: tenant(
    parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
    parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
  ),
  b: tenant(
    parsed(organizationCodec.parse(`org_${'2'.repeat(26)}`)),
    parsed(accountCodec.parse(`acc_${'3'.repeat(26)}`)),
  ),
}

/** The Agent host maintenance principal that the fixture's assembly entry issues. */
export const HOST_PRINCIPAL = 'agent-host-maintainer'

export const scope = { owner: 'session', record: 'slot-session', revision: '1', digest: 'sha256:s' }
export const definitions = {
  first: { owner: 'agents', name: 'planner', revision: '1', digest: 'sha256:first' },
  'other-definition': { owner: 'agents', name: 'planner', revision: '2', digest: 'sha256:other' },
} as const

export const IDLE_MS = 60_000

export const hostConfig: AgentHostConfig = {
  observerBufferBytes: 1024,
  reconciliationDelayMs: 0,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: [],
  coordination: 'standalone',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  instanceIdleMs: IDLE_MS,
}

export function caller(name: 'a' | 'b'): Access<Principal> {
  return { principal: `caller-${name}`, tenant: tenants[name] }
}

export function slotOf(
  name: 'a' | 'b',
  variant: keyof typeof definitions = 'first',
): AgentInstanceSlotInput<Principal> {
  return { ...caller(name), scope, definition: definitions[variant] }
}

export function ok<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function present<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`the world provides no ${key}`)
  return value
}

/** Lets every pending promise and timer of the current turns run. */
export async function turns(count = 20): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

/** The keys that the host plugin injects, in the order of its `inject` array. */
export const INJECTED = [
  'agentAccessCheck',
  'agentJournal',
  'agentAdoptions',
  'agentConditions',
  'agentRequests',
  'agentModelSelection',
  'agentModelContext',
  'agentMessageHandoff',
  'agentClock',
  'modelRuntime',
  'agentHostPrincipal',
] as const
export type Injected = (typeof INJECTED)[number]

/** The five services of the host plugin. */
export const PROVIDED = [
  'agentInstanceHost',
  'agentPublicationAuthority',
  'agentExecutionRecovery',
  'agentExecutionControl',
  'agentInstanceProvision',
] as const

type Constructor = new (ctx: Context) => object

// The definition classes are abstract; the fixture gives each one the members of a port double.
const services: Readonly<Record<Exclude<Injected, 'agentHostPrincipal'>, unknown>> = {
  agentAccessCheck: AgentAccessCheckService,
  agentJournal: AgentJournalService,
  agentAdoptions: AgentAdoptionsService,
  agentConditions: CurrentConditionsService,
  agentRequests: RequestPreparationService,
  agentModelSelection: ModelSelectionService,
  agentModelContext: ModelContextReaderService,
  agentMessageHandoff: MessageHandoffService,
  agentClock: AgentClockService,
  modelRuntime: ModelRuntimeService,
}

/** Provides `port` under the definition class of `key`, on a fiber of its own. */
export function serve(root: Context, key: keyof typeof services, port: object): Fiber {
  // The class is abstract only to TypeScript: the double supplies every abstract member.
  const Definition = services[key] as Constructor
  return root.plugin({
    name: `${key}-double`,
    apply(ctx: Context) {
      Object.assign(new Definition(ctx), port)
    },
  })
}

type Retirement = Readonly<{ instance: AgentInstanceId; generation: number; reason: string }>

export type World = Readonly<{
  root: Context
  host: Fiber
  controls: TestAgentControls<Principal>
  fibers: Readonly<Record<string, Fiber>>
  provision: Context['agentInstanceProvision']
  directory: Context['agentInstances']
  instanceHost: Context['agentInstanceHost']
  recovery: Context['agentExecutionRecovery']
  control: Context['agentExecutionControl']
  retired: Retirement[]
  errors: string[]
  /** The registration handles the factory got, by instance. Filled by `withRuntimeDuties` only. */
  handles: Map<AgentInstanceId, AgentRegistrationHandle<unknown>>
  /** The quiesce calls that reached a runtime under `withRuntimeDuties`. */
  quiesced: AgentInstanceId[]
  /** The next quiesce of `withRuntimeDuties` answers this; `drained` when unset. */
  quiesceAnswers: ('drained' | 'unresolved')[]
  /** The next check of `operation`, for `principal` when given, answers denied. */
  refuseNext(operation: string, principal?: Principal): void
  /** Moves the manual clock forward. */
  advance(ms: number): void
  dispose(): Promise<void>
}>

export type WorldOptions = Readonly<{
  factory?: 'plain' | 'duties'
  omit?: Injected
  config?: unknown
}>

export function occupied(instance: AgentInstanceId): AgentState {
  return {
    kind: 'occupied',
    instance,
    execution: ok(decodeAgentExecutionId('held-execution')),
    executionAttachment: ok(decodeExecutionAttachmentId('held-attachment')),
  }
}

/** The Agent factory with the runtime duties that `createAgentRuntime` does not keep yet. */
function withRuntimeDuties(
  world: Pick<World, 'handles' | 'quiesced' | 'quiesceAnswers'>,
): RuntimeFactory {
  return async (dependencies, options) => {
    const made = await createAgentRuntime(dependencies, options)
    const handle = dependencies.registration
    if ('failure' in made || handle === null) return made
    const { instance } = options.binding
    world.handles.set(instance, handle)
    let draining = false
    const refuse = (diagnostic: string): Outcome<never, Failure> =>
      fail({ kind: 'unavailable', owner: 'runtime-duties', diagnostic })
    const { runtime } = made.ok
    return succeed({
      ...made.ok,
      runtime: {
        instance: runtime.instance,
        invoke(input) {
          if (draining) return Promise.resolve(refuse('the runtime is draining'))
          handle.report({ state: occupied(instance) })
          return runtime.invoke(input)
        },
        resume(input) {
          if (draining) return Promise.resolve(refuse('the runtime is draining'))
          return runtime.resume(input)
        },
      },
      control: {
        async quiesce(input) {
          draining = true
          world.quiesced.push(instance)
          const decision = await dependencies.access.check({
            access: { principal: input.principal, tenant: input.tenant },
            operation: 'quiesce',
            target: { kind: 'instance', instance },
          })
          if (decision.kind !== 'allowed') {
            draining = false
            return fail({ kind: 'denied', action: 'quiesce' })
          }
          if (world.quiesceAnswers.shift() === 'unresolved') {
            draining = false
            return succeed({ kind: 'unresolved', remaining: [], evidence: input.reason })
          }
          const withdrawn = await handle.withdraw(input)
          if ('failure' in withdrawn) return withdrawn
          return succeed({ kind: 'drained', remaining: [], evidence: input.reason })
        },
      },
    })
  }
}

/** Builds the world. Every injected service is present unless `omit` names one. */
export async function openWorld(options: WorldOptions = {}): Promise<World> {
  const root = new Context()
  const { dependencies, controls } = createTestAgentDependencies<Principal>()
  const refusals: { operation: string; principal: Principal | undefined }[] = []
  controls.access.check.always(input => {
    const at = refusals.findIndex(
      refusal =>
        refusal.operation === input.operation &&
        (refusal.principal === undefined || refusal.principal === input.access.principal),
    )
    if (at < 0)
      return { kind: 'allowed', evidence: { ...scope, record: `access/${input.operation}` } }
    refusals.splice(at, 1)
    return { kind: 'denied' }
  })
  const errors: string[] = []
  root.logger.exporter({
    export: message => {
      if (message.type === 'error') errors.push(String(message.args[0]))
    },
  })
  const retired: Retirement[] = []
  root.on('agent-cordis-contract/instance-retired', (_tenant, instance, generation, reason) => {
    retired.push({ instance, generation, reason })
  })
  const ports: Readonly<Record<keyof typeof services, object>> = {
    agentAccessCheck: controls.access.port,
    agentJournal: controls.journal.port,
    agentAdoptions: controls.adoptions.port,
    agentConditions: controls.conditions.port,
    agentRequests: controls.requests.port,
    agentModelSelection: controls.selection.port,
    agentModelContext: controls.modelContext.port,
    agentMessageHandoff: controls.handoff.port,
    agentClock: controls.clock.port,
    modelRuntime: dependencies.models,
  }
  const fibers: Record<string, Fiber> = {}
  for (const key of Object.keys(services) as (keyof typeof services)[]) {
    if (key === options.omit) continue
    fibers[key] = serve(root, key, ports[key])
    await fibers[key]
  }
  if (options.omit !== 'agentHostPrincipal') root.provide('agentHostPrincipal', HOST_PRINCIPAL)
  const handles = new Map<AgentInstanceId, AgentRegistrationHandle<unknown>>()
  const quiesced: AgentInstanceId[] = []
  const quiesceAnswers: ('drained' | 'unresolved')[] = []
  const factory: RuntimeFactory =
    options.factory === 'duties'
      ? withRuntimeDuties({ handles, quiesced, quiesceAnswers })
      : (deps, opts) => createAgentRuntime(deps, opts)
  const configured = 'config' in options
  const host = root.plugin(
    createAgentHostPlugin(factory),
    (configured ? options.config : hostConfig) as AgentHostConfig,
  )
  // A refused configuration rejects the fiber; the test that expects it awaits the fiber itself.
  host.then(undefined, () => undefined)
  const directoryFiber = root.plugin(agentInstancesPlugin)
  if (options.omit === undefined && !configured) {
    await host
    await directoryFiber
  } else {
    await turns(5)
  }
  return {
    root,
    host,
    controls,
    fibers,
    get provision() {
      return present(root.get('agentInstanceProvision'), 'agentInstanceProvision')
    },
    get directory() {
      return present(root.get('agentInstances'), 'agentInstances')
    },
    get instanceHost() {
      return present(root.get('agentInstanceHost'), 'agentInstanceHost')
    },
    get recovery() {
      return present(root.get('agentExecutionRecovery'), 'agentExecutionRecovery')
    },
    get control() {
      return present(root.get('agentExecutionControl'), 'agentExecutionControl')
    },
    retired,
    errors,
    handles,
    quiesced,
    quiesceAnswers,
    refuseNext(operation, principal) {
      refusals.push({ operation, principal })
    },
    advance(ms) {
      const at = Date.parse(controls.clock.now()) + ms
      ok(controls.clock.advanceTo(new Date(at).toISOString()))
    },
    async dispose() {
      await root.fiber.dispose()
    },
  }
}
