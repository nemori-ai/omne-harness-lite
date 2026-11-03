// The world of the host tests: a real Cordis 4.0.4 root that provides every service the `agent-host`
// plugin injects, the directory plugin of agent-cordis-contract, and the host plugin itself. The
// services are the non-durable doubles of `@omne-harness/agent/testing` behind Service subclasses of
// the definition entry; nothing here proves a real provider, durability or another process. With
// `stages` the world also provides the six locally required dependencies from the same doubles, so
// the Loop of `createAgentRuntime` reaches its Model requests; `admits` records each of them.
//
// The world also provides the five services of the Model result receiver: `agentJournalEntries`,
// `agentMaterials`, `agentReceivedCommits` and `agentModelReceptionTargets` from the same memory
// Journal, and `agentAccountOutlet` from the memory outlet of agent-contract. The Model runtime has a
// result receiver table the world holds (`receivers`); with `pushTo: 'host'` the scripted pusher
// resolves its receiver from that table, as a Model runtime does, so a push reaches only the
// receiver the host registered.
//
// `withRuntimeDuties` wraps the Agent factory with the two runtime duties of XC-AGINST 3.5 as a
// script: quiesce marks the runtime draining before its first `await` and withdraws through the
// registration handle, and invoke reports `occupied` in the same step that takes the slot. Since
// R2-D173 (R2-D185) `createAgentRuntime` keeps the first duty for an idle instance; it does not keep
// the second (a reservation still shows idle), and an execution in its slot answers `unresolved`.
// The wrapper scripts the answers that the host must handle. Tests that use it prove the host side
// only; tests that use the plain factory show what the real runtime answers.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { createAgentRuntime } from '@omne-harness/agent'
import {
  createTestAgentDependencies,
  type TestAgentControls,
  type TestAgentDependenciesOptions,
} from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeExecutionAttachmentId,
  type Access,
  type AgentAccountOutlet,
  type AgentClock,
  type AgentInstanceId,
  type AgentRegistrationHandle,
  type AgentState,
  type Failure,
} from '@omne-harness/agent-contract'
import {
  ActionAdmissionService,
  AgentAccessCheckService,
  AgentAdoptionsService,
  AgentAccountOutletService,
  AgentClockService,
  AgentJournalEntriesService,
  AgentJournalService,
  AgentMaterialsService,
  AgentReceivedCommitsService,
  ModelReceptionTargetsService,
  CurrentConditionsService,
  DecisionCardsService,
  ExtensionImplementationsService,
  MessageHandoffService,
  ModelContextReaderService,
  ModelSelectionService,
  RegisteredReadsService,
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
import { createMemoryAgentAccountOutlet } from '@omne-harness/agent-contract/testing'
import type { Admission, ModelResultReceiver, ModelRuntime } from '@omne-harness/model-contract'
import {
  ModelRuntimeService,
  createModelResultReceiverTable,
  type ModelResultReceiverTable,
} from '@omne-harness/model-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentHostConfig } from '../src/host-config.ts'
import { createAgentHostPlugin, type AgentHostPlugin } from '../src/host-plugin.ts'
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
  'agentJournalEntries',
  'agentMaterials',
  'agentReceivedCommits',
  'agentModelReceptionTargets',
  'agentAccountOutlet',
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
  agentJournalEntries: AgentJournalEntriesService,
  agentMaterials: AgentMaterialsService,
  agentReceivedCommits: AgentReceivedCommitsService,
  agentModelReceptionTargets: ModelReceptionTargetsService,
  agentAccountOutlet: AgentAccountOutletService,
}

/**
 * Provides `port` under the definition class of `key`, on a fiber of its own. The Model runtime
 * gets `receivers` as its result receiver table, so a registration lands where the test can read.
 */
export function serve(
  root: Context,
  key: keyof typeof services,
  port: object,
  receivers?: ModelResultReceiverTable<unknown>,
): Fiber {
  // The class is abstract only to TypeScript: the double supplies every abstract member.
  const Definition = services[key] as new (ctx: Context, table?: unknown) => object
  return root.plugin({
    name: `${key}-double`,
    apply(ctx: Context) {
      Object.assign(new Definition(ctx, key === 'modelRuntime' ? receivers : undefined), port)
    },
  })
}

// The definition classes of the locally required dependencies; `toolRuntime` is provided as it is.
const stageServices = [
  [ExtensionImplementationsService, 'extensions'],
  [DecisionCardsService, 'cards'],
  [ActionAdmissionService, 'admission'],
  [RegisteredReadsService, 'reads'],
] as const

/** Provides the locally required dependencies (`agentMaterials` is always served) from `controls`. */
async function serveStages(root: Context, controls: TestAgentControls<Principal>): Promise<void> {
  for (const [Definition, name] of stageServices) {
    const port = controls[name].port
    await root.plugin({
      name: `agent-${name}-double`,
      apply(ctx: Context) {
        Object.assign(new (Definition as unknown as Constructor)(ctx), port)
      },
    })
  }
  await root.plugin({
    name: 'tool-runtime-double',
    apply(ctx: Context) {
      ctx.provide('toolRuntime', controls.tools.port)
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
  /** Every warning the root logger exported, in order. */
  warnings: string[]
  /** Every answer of the Model's admit, in order: one per Model request that the Loop sent. */
  admits: Outcome<Admission, unknown>[]
  /** Every `load` and `recordControl` the Journal served, with the principal that asked. */
  journalCalls: JournalCall[]
  /** The registration handles the factory got, by instance. Filled by `withRuntimeDuties` only. */
  handles: Map<AgentInstanceId, AgentRegistrationHandle<unknown>>
  /** The quiesce calls that reached a runtime under `withRuntimeDuties`. */
  quiesced: AgentInstanceId[]
  /** The next quiesce of `withRuntimeDuties` answers this; `drained` when unset. */
  quiesceAnswers: QuiesceScript[]
  /** The plugin the world loaded, with its ordered stop. */
  plugin: AgentHostPlugin
  /** The result receiver table of the Model runtime double. */
  receivers: ModelResultReceiverTable<unknown>
  /** The account outlet double. */
  outlet: ReturnType<typeof createMemoryAgentAccountOutlet<Principal>>
  /** The next check of `operation`, for `principal` when given, answers denied. */
  refuseNext(operation: string, principal?: Principal): void
  /** Moves the manual clock forward. */
  advance(ms: number): void
  dispose(): Promise<void>
}>

export type JournalCall = Readonly<{ method: 'load' | 'recordControl'; principal: unknown }>

/**
 * What one quiesce of `withRuntimeDuties` does after its access check. `drained` withdraws through
 * the handle and answers drained; `unresolved` answers unresolved and stays serving; `hang` never
 * answers; `throw` rejects; `drained-kept` answers drained without withdrawing, so only the unload
 * of the contribution fiber can end the registration (`contributor-removed`).
 */
export type QuiesceScript = 'drained' | 'unresolved' | 'hang' | 'throw' | 'drained-kept'

export type WorldOptions = Readonly<{
  factory?: 'plain' | 'duties'
  omit?: Injected
  config?: unknown
  /** The plugin to load instead of the one over `factory`, for the factory-made plugin cases. */
  plugin?: AgentHostPlugin
  /** The options of the test dependencies, such as the Journal's cancellation policy. */
  dependencies?: TestAgentDependenciesOptions<Principal>
  /**
   * Also provides the six locally required dependencies (tools, extensions, cards, action
   * admission, materials and registered reads) from the same doubles, so the Loop can run.
   */
  stages?: boolean
  /**
   * `host`: the scripted pusher resolves the receiver from the Model runtime's table (needs
   * `dependencies.receivingPrincipal`). Absent: it pushes to the receiver of the test dependencies.
   */
  pushTo?: 'host'
  /** The account outlet to provide instead of the memory outlet. */
  outlet?: AgentAccountOutlet<Principal>
  /** Wraps the manual clock port that the world provides as `agentClock`. */
  clock?: (port: AgentClock) => AgentClock
}>

export function occupied(instance: AgentInstanceId): AgentState {
  return {
    kind: 'occupied',
    instance,
    execution: ok(decodeAgentExecutionId('held-execution')),
    executionAttachment: ok(decodeExecutionAttachmentId('held-attachment')),
  }
}

/** The Agent factory with both runtime duties kept by a script, and scripted quiesce answers. */
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
          const script = world.quiesceAnswers.shift() ?? 'drained'
          if (script === 'unresolved') {
            draining = false
            return succeed({ kind: 'unresolved', remaining: [], evidence: input.reason })
          }
          if (script === 'hang') return new Promise(() => {})
          if (script === 'throw') throw new Error('the runtime broke during quiesce')
          if (script === 'drained-kept')
            return succeed({ kind: 'drained', remaining: [], evidence: input.reason })
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
  const receivers = createModelResultReceiverTable<unknown>()
  const { dependencies, controls } = createTestAgentDependencies<Principal>({
    ...options.dependencies,
    ...(options.pushTo === 'host'
      ? {
          // The table holds receivers of any principal type; the pusher of this world uses strings.
          resolveReceiver: (owner: string) =>
            receivers.resolve(owner) as ModelResultReceiver<Principal> | null,
        }
      : {}),
  })
  const outlet = createMemoryAgentAccountOutlet<Principal>()
  const admits: Outcome<Admission, unknown>[] = []
  const models: ModelRuntime<Principal> = {
    ...dependencies.models,
    calls: {
      ...dependencies.models.calls,
      async admit(input) {
        const admitted = await dependencies.models.calls.admit(input)
        admits.push(admitted)
        return admitted
      },
    },
  }
  const journalCalls: JournalCall[] = []
  const base = controls.journal.port
  const journal: typeof base = {
    ...base,
    load(input) {
      journalCalls.push({ method: 'load', principal: input.principal })
      return base.load(input)
    },
    recordControl(input) {
      journalCalls.push({ method: 'recordControl', principal: input.principal })
      return base.recordControl(input)
    },
  }
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
  const warnings: string[] = []
  // Cordis 4.0.4 orders WARN (2) above INFO (1): a warning reaches only an exporter at level 2 or more.
  root.logger.exporter({
    levels: { default: 2 },
    export: message => {
      if (message.type === 'error') errors.push(String(message.args[0]))
      if (message.type === 'warn') warnings.push(String(message.args[0]))
    },
  })
  const retired: Retirement[] = []
  root.on('agent-cordis-contract/instance-retired', (_tenant, instance, generation, reason) => {
    retired.push({ instance, generation, reason })
  })
  const ports: Readonly<Record<keyof typeof services, object>> = {
    agentAccessCheck: controls.access.port,
    agentJournal: journal,
    agentAdoptions: controls.adoptions.port,
    agentConditions: controls.conditions.port,
    agentRequests: controls.requests.port,
    agentModelSelection: controls.selection.port,
    agentModelContext: controls.modelContext.port,
    agentMessageHandoff: controls.handoff.port,
    agentClock: options.clock?.(controls.clock.port) ?? controls.clock.port,
    modelRuntime: models,
    agentJournalEntries: controls.journal.provider.entries,
    agentMaterials: controls.materials.port,
    agentReceivedCommits: present(controls.journal.provider.received ?? undefined, 'received'),
    agentModelReceptionTargets: controls.journal.targets,
    agentAccountOutlet: options.outlet ?? outlet,
  }
  const fibers: Record<string, Fiber> = {}
  for (const key of Object.keys(services) as (keyof typeof services)[]) {
    if (key === options.omit) continue
    fibers[key] = serve(root, key, ports[key], receivers)
    await fibers[key]
  }
  if (options.stages === true) await serveStages(root, controls)
  if (options.omit !== 'agentHostPrincipal') root.provide('agentHostPrincipal', HOST_PRINCIPAL)
  const handles = new Map<AgentInstanceId, AgentRegistrationHandle<unknown>>()
  const quiesced: AgentInstanceId[] = []
  const quiesceAnswers: QuiesceScript[] = []
  const factory: RuntimeFactory =
    options.factory === 'duties'
      ? withRuntimeDuties({ handles, quiesced, quiesceAnswers })
      : (deps, opts) => createAgentRuntime(deps, opts)
  const configured = 'config' in options
  const plugin = options.plugin ?? createAgentHostPlugin(factory)
  const host = root.plugin(plugin, (configured ? options.config : hostConfig) as AgentHostConfig)
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
    warnings,
    admits,
    journalCalls,
    handles,
    quiesced,
    quiesceAnswers,
    plugin,
    receivers,
    outlet,
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
