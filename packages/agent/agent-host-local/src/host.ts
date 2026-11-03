// The state and the five faces of the `agent-host` plugin (docs/cordis.md "装载", "停止准入与撤除"):
// the reservation table, the slot table, the runtimes the host holds and the registrations of its
// instances. One plugin body builds one host, so the faces share one table and end together.
//
// What the host decides, and what it leaves to its owners:
// - `acquire` checks only the caller's `reserve`; the host principal publishes. A slot has at most
//   one published instance that is not being reclaimed, and concurrent calls share one build.
// - The publication authority answers from the reservation table in one step that never yields:
//   a registration needs a publish operation that the host started for that reservation, from the
//   contribution fiber of the instance; a withdrawal needs a registration identity of the instance,
//   from the host's own fiber or that contribution fiber.
// - Idle reclaim: the expiry reads the last report, marks the instance and calls quiesce without
//   an `await` in between. Only `drained` unloads the contribution fiber. Any other answer keeps the
//   instance published, writes an error record and waits for the next idle time.
// - Ordered stop (`quiesceAll`): admission closes first, so `acquire` and `reserve` refuse and no
//   instance is built. Then every published instance the host runs gets the same quiesce as the
//   reclaim, whatever its last report. Only `drained` unloads the contribution fiber. The answer is
//   `settled` only when every instance drained before the caller's signal; otherwise it names each
//   instance that did not and why. An instance that did not drain stays published for the fiber
//   unload (docs/cordis.md "停止准入与撤除").
// - The recovery and control entries check the principal and then call the Journal. They need no
//   live runtime and keep the Journal's answer, unknown included. A control that the Journal
//   accepted is advanced like the handle does it when a runtime this host still runs holds the
//   active attachment of the execution; otherwise it stays accepted for the recovery path.
// The runtime's own duties (quiesce drains, detaches and withdraws through the handle) belong to
// the factory. The host never takes the end of a fiber for a detach or for a stopped execution.
import { randomUUID } from 'node:crypto'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import {
  advanceControl,
  type AgentConfiguration,
  type AgentDependencies,
  type AgentProvider,
  type AgentRuntimeOptions,
} from '@omne-harness/agent'
import {
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeAgentRegistrationId,
  judgeAdoption,
  judgeEvidence,
  type Access,
  type Adoption,
  type AgentAccessOperation,
  type AgentAccessTarget,
  type AgentDirectory,
  type AgentExecutionControl,
  type AgentExecutionRecovery,
  type AgentInstanceHost,
  type AgentInstanceId,
  type AgentJournal,
  type AgentRegistrationHandle,
  type AgentRegistrationId,
  type AgentState,
  type DurableEvidence,
  type Failure,
  type QuiesceResult,
  type Registration,
  type Reply,
} from '@omne-harness/agent-contract'
import type {
  AgentInstanceProvision,
  AgentInstanceSlotInput,
  AgentLocalRoute,
  AgentRegistrationInput,
  AgentWithdrawalInput,
} from '@omne-harness/agent-cordis-contract'
import {
  agentActionAdmissionKey,
  agentDecisionCardsKey,
  agentExtensionsKey,
  agentMaterialsKey,
  agentReadsKey,
  type AgentPublicationAuthority,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelRuntime } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolRuntime } from '@omne-harness/tool-contract'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { AgentHostConfig } from './host-config.ts'
import { stagePort } from './stage-ports.ts'

/** The factory the host calls for each instance: `createAgentRuntime` in production. */
export type RuntimeFactory = (
  dependencies: AgentDependencies<unknown, ContentBlock>,
  options: AgentRuntimeOptions,
) => Reply<AgentProvider<unknown>>

/** The statically injected services that the factory takes as they are. */
export type HostStatics = Readonly<{
  journal: AgentJournal<unknown>
  access: AgentDependencies<unknown, ContentBlock>['access']
  models: ModelRuntime<unknown>
  adoptions: AgentDependencies<unknown, ContentBlock>['adoptions']
  conditions: AgentDependencies<unknown, ContentBlock>['conditions']
  requests: AgentDependencies<unknown, ContentBlock>['requests']
  selection: AgentDependencies<unknown, ContentBlock>['selection']
  modelContext: AgentDependencies<unknown, ContentBlock>['modelContext']
  handoff: AgentDependencies<unknown, ContentBlock>['handoff']
  clock: AgentDependencies<unknown, ContentBlock>['clock']
}>

export type HostInput = Readonly<{
  ctx: Context
  config: AgentHostConfig
  factory: RuntimeFactory
  statics: HostStatics
  /** The Agent host maintenance principal (`agentHostPrincipal`), issued by the assembly entry. */
  principal: unknown
}>

/** The faces that the plugin provides, and the hooks of the plugin body. */
export type Host = Readonly<{
  instanceHost: AgentInstanceHost<unknown> &
    Readonly<{
      route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<unknown> | null
    }>
  authority: AgentPublicationAuthority<unknown>
  recovery: AgentExecutionRecovery<unknown>
  control: AgentExecutionControl<unknown>
  provision: AgentInstanceProvision<unknown>
  /** The directory removed one registration of an instance. */
  retired(tenant: TenantId, instance: AgentInstanceId, generation: number, reason: string): void
  /** The ordered stop: close admission, quiesce every instance, answer what did not drain. */
  quiesceAll(input: AgentHostStopInput): Promise<AgentHostStopResult>
  /** The plugin body ends: no new instance, no reclaim. */
  stop(): void
}>

/** The input of the ordered stop. The caller owns the deadline: the signal aborts when it passes. */
export type AgentHostStopInput = Readonly<{ signal: AbortSignal }>

/** One instance, or one build, that the ordered stop did not end, and why. */
export type AgentHostUnsettled = Readonly<{
  /** Null for a build that had not published an instance by the deadline. */
  instance: AgentInstanceId | null
  reason: string
}>

/**
 * The answer of the ordered stop. `settled`: admission is closed and every instance drained and
 * unloaded. `incomplete`: admission is closed, and `instances` names each one that did not end.
 */
export type AgentHostStopResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'incomplete'; detail: string; instances: readonly AgentHostUnsettled[] }>

type Granted = Readonly<{ instance: AgentInstanceId; registration: Registration }>
type Reserved = Readonly<{
  instance: AgentInstanceId
  registration: AgentRegistrationHandle<unknown>
}>
type Contribution = Readonly<{ ctx: Context; fiber: Fiber }>

type Status = 'reserved' | 'published' | 'reclaiming' | 'retired'

type InstanceRecord = {
  readonly tenant: TenantId
  readonly tenantText: string
  readonly instance: AgentInstanceId
  readonly key: string
  readonly scope: DurableEvidence
  readonly scopeText: string
  readonly definition: Adoption
  readonly handle: AgentRegistrationHandle<unknown>
  /** The publish operations the host started for this reservation: the authority admits these. */
  readonly publishOperations: Set<string>
  /** Every registration identity the directory gave this instance, oldest first. */
  readonly registrations: AgentRegistrationId[]
  provider: AgentProvider<unknown> | null
  contribution: Promise<Outcome<Contribution, Failure>> | null
  contributed: Contribution | null
  current: Registration | null
  reported: AgentState
  timer: AbortController | null
  slot: string | null
  status: Status
  /** The quiesce in flight (reclaim or ordered stop); it resolves after a drained instance retired. */
  quiescing: Promise<Quiesced> | null
}

type Quiesced = Outcome<QuiesceResult, Failure>

const OWNER = 'agent-host'
const CLOSED = 'the host has stopped admitting instances'

const unavailable = (owner: string, diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})
const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })
const denied = (action: string): Failure => ({ kind: 'denied', action })

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

/** The text of a tenant that the identity parser made, or undefined for any other value. */
function tenantTextOf(value: unknown): string | undefined {
  try {
    // `encode` takes any value and answers whether the identity parser made it.
    const encoded = tenantCodec.encode(value as TenantId)
    return encoded.ok ? encoded.value : undefined
  } catch {
    return undefined
  }
}

/** JSON with the members of each object in sorted order, or undefined when it cannot be written. */
function dataText(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, (_name, member: unknown) =>
      typeof member === 'object' && member !== null && !Array.isArray(member)
        ? Object.fromEntries(
            Object.entries(member).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          )
        : member,
    )
  } catch {
    return undefined
  }
}

const keyOf = (tenant: string, member: string) => JSON.stringify([tenant, member])

function minted<T>(decoded: Outcome<T, unknown>): T | undefined {
  return 'ok' in decoded ? decoded.ok : undefined
}

/** A host-derived operation identity: unique, never given by a caller. */
const mintOperation = (kind: string) =>
  minted(decodeAgentOperationId(`agent-host/${kind}/${randomUUID()}`))

/** The reason evidence of an idle reclaim (agent-cordis-contract docs/cordis.md "空闲回收"). */
function reclaimReason(instance: AgentInstanceId): DurableEvidence {
  return { owner: OWNER, record: 'idle-reclaim', revision: '1', digest: `instance:${instance}` }
}

/** The reason evidence of the ordered stop, written like the reclaim's. */
function stopReason(instance: AgentInstanceId): DurableEvidence {
  return { owner: OWNER, record: 'ordered-stop', revision: '1', digest: `instance:${instance}` }
}

/** Why a quiesce answer is not `drained`, or undefined when it is. */
function notDrained(result: Quiesced): string | undefined {
  if ('ok' in result)
    return result.ok.kind === 'drained'
      ? undefined
      : `quiesce left ${result.ok.remaining.length} execution(s) unresolved`
  const { failure } = result
  return failure.kind === 'unavailable'
    ? `quiesce failed with unavailable (${failure.owner}: ${failure.diagnostic})`
    : `quiesce failed with ${failure.kind}`
}

/** The factory configuration: the plugin configuration without the host's own item. */
function factoryConfiguration(config: AgentHostConfig): AgentConfiguration {
  const { instanceIdleMs: _host, ...configuration } = config
  return configuration
}

export function createHost(input: HostInput): Host {
  const { ctx, config, factory, statics, principal } = input
  const records = new Map<string, InstanceRecord>()
  const reserves = new Map<string, Readonly<{ text: string; answer: Reserved }>>()
  const withdrawals = new Map<string, Readonly<{ text: string; answer: Registration }>>()
  const slots = new Map<string, InstanceRecord>()
  const building = new Map<string, Promise<Outcome<Granted, Failure>>>()
  let stopped = false
  /** The ordered stop began: no instance is reserved, built or reclaimed from now on. */
  let closing = false

  function record(level: 'error' | 'info', message: string): void {
    try {
      ctx.logger(OWNER)[level](message)
    } catch {
      // The context has ended; there is nobody to tell.
    }
  }

  // --- access ----------------------------------------------------------------------------------

  /** One check of the authorization domain. Anything but `allowed` refuses; nothing defaults to allowed. */
  async function qualify(
    access: Access<unknown>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
  ): Promise<Failure | undefined> {
    try {
      const decision = await statics.access.check({
        access: { principal: access.principal, tenant: access.tenant },
        operation,
        target,
      })
      switch (decision.kind) {
        case 'allowed':
          return undefined
        case 'denied':
          return denied(operation)
        case 'unavailable':
          return unavailable('agentAccessCheck', decision.diagnostic)
        default: {
          const _exhaustive: never = decision
          return unavailable(
            'agentAccessCheck',
            `an answer of another shape: ${String(_exhaustive)}`,
          )
        }
      }
    } catch (error) {
      record('error', `agentAccessCheck threw for ${operation}: ${describe(error)}`)
      return unavailable('agentAccessCheck', 'the access check gave no answer')
    }
  }

  // --- registration ----------------------------------------------------------------------------

  function directoryOf(context: Context): Outcome<Context['agentInstances'], Failure> {
    const directory = context.get('agentInstances')
    return directory === undefined
      ? fail(unavailable('agentInstances', 'no directory is present'))
      : succeed(directory)
  }

  /** The contribution fiber of an instance, under the host's own Context. A retry reuses it. */
  function contributionOf(entry: InstanceRecord): Promise<Outcome<Contribution, Failure>> {
    entry.contribution ??= (async () => {
      const made: { ctx?: Context } = {}
      try {
        const fiber = ctx.plugin({
          name: 'agent-instance',
          apply: (child: Context) => {
            made.ctx = child
          },
        })
        await fiber
        if (made.ctx === undefined)
          return fail(unavailable(OWNER, 'the contribution did not start'))
        entry.contributed = { ctx: made.ctx, fiber: made.ctx.fiber }
        return succeed(entry.contributed)
      } catch (error) {
        entry.contribution = null
        return fail(unavailable(OWNER, `the contribution could not start: ${describe(error)}`))
      }
    })()
    return entry.contribution
  }

  function noteRegistration(entry: InstanceRecord, registration: Registration): void {
    if (!entry.registrations.includes(registration.registration))
      entry.registrations.push(registration.registration)
    if (entry.registrations.at(-1) === registration.registration) entry.current = registration
    if (registration.state === 'published' && entry.status === 'reserved')
      entry.status = 'published'
  }

  /** Registers in the contribution fiber of the instance, after the caller's check. */
  async function publishChecked(
    entry: InstanceRecord,
    input: AgentRegistrationInput<unknown>,
  ): Reply<Registration> {
    entry.publishOperations.add(input.operation)
    const contribution = await contributionOf(entry)
    if ('failure' in contribution) return contribution
    const directory = directoryOf(contribution.ok.ctx)
    if ('failure' in directory) return directory
    try {
      const answer = await directory.ok.register(input)
      if ('ok' in answer) noteRegistration(entry, answer.ok)
      return answer
    } catch (error) {
      record('error', `agentInstances.register threw: ${describe(error)}`)
      return fail(unavailable('agentInstances', 'the directory gave no answer'))
    }
  }

  /** Withdraws through the directory from the host's own fiber. */
  async function withdrawChecked(input: AgentWithdrawalInput<unknown>): Reply<Registration> {
    const directory = directoryOf(ctx)
    if ('failure' in directory) return directory
    try {
      const answer = await directory.ok.withdraw(input)
      const tenant = tenantTextOf(input.tenant)
      const entry = tenant === undefined ? undefined : records.get(keyOf(tenant, input.instance))
      if ('ok' in answer && entry?.current?.registration === answer.ok.registration)
        entry.current = answer.ok
      return answer
    } catch (error) {
      record('error', `agentInstances.withdraw threw: ${describe(error)}`)
      return fail(unavailable('agentInstances', 'the directory gave no answer'))
    }
  }

  // --- idle reclaim ----------------------------------------------------------------------------

  function disarm(entry: InstanceRecord): void {
    entry.timer?.abort()
    entry.timer = null
  }

  /** Starts the idle time of a published instance that the host runs. */
  function arm(entry: InstanceRecord): void {
    disarm(entry)
    if (stopped || closing || entry.status !== 'published' || entry.provider === null) return
    const timer = new AbortController()
    entry.timer = timer
    void (async () => {
      try {
        const now = await statics.clock.now()
        if ('failure' in now) {
          record('error', `agentClock gave no reading; ${entry.instance} stays published`)
          return
        }
        const deadline = Date.parse(now.ok) + config.instanceIdleMs
        if (Number.isNaN(deadline)) {
          record('error', `agentClock gave a reading that is not an instant: ${now.ok}`)
          return
        }
        const waited = await statics.clock.waitUntil(new Date(deadline).toISOString(), timer.signal)
        if (entry.timer !== timer || timer.signal.aborted) return
        entry.timer = null
        if ('failure' in waited) {
          record('error', `agentClock could not wait: ${waited.failure.kind}`)
          return
        }
        if (waited.ok === 'elapsed') expire(entry)
      } catch (error) {
        record('error', `the idle time of ${entry.instance} failed: ${describe(error)}`)
      }
    })()
  }

  /**
   * Marks the instance, takes it out of its slot and calls quiesce, in one step that never yields.
   * The returned answer resolves after a `drained` instance retired; any other answer puts the
   * instance back to published, and back into its slot when `restore` holds and admission is open.
   * Undefined when no quiesce operation could be made; then nothing changed.
   */
  function quiesceNow(
    entry: InstanceRecord,
    provider: AgentProvider<unknown>,
    reason: DurableEvidence,
    restore: boolean,
  ): Promise<Quiesced> | undefined {
    const operation = mintOperation('quiesce')
    if (operation === undefined) return undefined
    disarm(entry)
    entry.status = 'reclaiming'
    if (entry.slot !== null && slots.get(entry.slot) === entry) slots.delete(entry.slot)
    let answer: Reply<QuiesceResult>
    try {
      answer = provider.control.quiesce({
        principal,
        tenant: entry.tenant,
        operation,
        reason,
      })
    } catch (error) {
      answer = Promise.resolve(fail(unavailable(OWNER, `quiesce threw: ${describe(error)}`)))
    }
    const settled = answer
      .then(
        result => result,
        (error: unknown) => fail(unavailable(OWNER, `quiesce rejected: ${describe(error)}`)),
      )
      .then(async (result): Promise<Quiesced> => {
        if (notDrained(result) === undefined) await retire(entry)
        else if (entry.status === 'reclaiming') {
          entry.status = 'published'
          if (restore && !closing && !stopped) {
            if (entry.slot !== null && !slots.has(entry.slot) && !building.has(entry.slot))
              slots.set(entry.slot, entry)
            if (entry.reported.kind === 'idle') arm(entry)
          }
        }
        if (entry.quiescing === settled) entry.quiescing = null
        return result
      })
    entry.quiescing = settled
    return settled
  }

  /**
   * The guard point. It reads the last report, marks the instance and calls quiesce in one step
   * that never yields, so an invoke either took the slot first (the report is not idle) or meets a
   * draining runtime.
   */
  function expire(entry: InstanceRecord): void {
    if (stopped || closing || entry.status !== 'published') return
    const { provider } = entry
    if (provider === null || entry.reported.kind !== 'idle') return
    const settled = quiesceNow(entry, provider, reclaimReason(entry.instance), true)
    if (settled === undefined) {
      record('error', `no quiesce operation could be made for ${entry.instance}`)
      return
    }
    void settled.then(result => {
      const why = notDrained(result)
      if (why === undefined)
        record('info', `${entry.instance} reclaimed after ${config.instanceIdleMs} ms idle`)
      else
        record('error', `${entry.instance} stays published: ${why}; the next idle time tries again`)
    })
  }

  /** Ends an instance: no route, no timer, and its contribution fiber unloads. */
  async function retire(entry: InstanceRecord): Promise<void> {
    entry.status = 'retired'
    disarm(entry)
    entry.provider = null
    if (entry.slot !== null && slots.get(entry.slot) === entry) slots.delete(entry.slot)
    const contribution = entry.contributed
    if (contribution === null) return
    try {
      await contribution.fiber.dispose()
    } catch (error) {
      record(
        'error',
        `the contribution of ${entry.instance} did not end cleanly: ${describe(error)}`,
      )
    }
  }

  // --- reservation -----------------------------------------------------------------------------

  /** The registration capability of one instance. It only reaches the instance's own registration. */
  function handleOf(key: string, instance: AgentInstanceId): AgentRegistrationHandle<unknown> {
    return {
      instance,
      report({ state }) {
        const entry = records.get(key)
        if (entry === undefined) return
        entry.reported = state
        if (state.kind === 'idle') arm(entry)
        else disarm(entry)
      },
      async withdraw(input) {
        const entry = records.get(key)
        const tenant = tenantTextOf(input.tenant)
        if (entry === undefined || tenant !== entry.tenantText) return fail(denied('withdraw'))
        const refused = await qualify(input, 'withdraw', { kind: 'instance', instance })
        if (refused !== undefined) return fail(refused)
        const current = entry.current
        if (current === null || current.state === 'withdrawn') return succeed(null)
        return withdrawChecked({
          principal: input.principal,
          tenant: input.tenant,
          operation: input.operation,
          instance,
          registration: current.registration,
        })
      },
    }
  }

  /** Reserves an instance identity after the caller's check. The directory must be present. */
  function reserveChecked(
    access: Access<unknown>,
    tenantText: string,
    scope: DurableEvidence,
    definition: Adoption,
  ): Outcome<InstanceRecord, Failure> {
    if (stopped) return fail(unavailable(OWNER, 'the host has stopped'))
    if (closing) return fail(unavailable(OWNER, CLOSED))
    if (ctx.get('agentInstances') === undefined)
      return fail(unavailable('agentInstances', 'no directory is present'))
    const instance = minted(decodeAgentInstanceId(`agent-instance-${randomUUID()}`))
    const scopeText = dataText(scope)
    if (instance === undefined || scopeText === undefined)
      return fail(unavailable(OWNER, 'no instance identity could be made'))
    const key = keyOf(tenantText, instance)
    const entry: InstanceRecord = {
      tenant: access.tenant,
      tenantText,
      instance,
      key,
      scope,
      scopeText,
      definition,
      handle: handleOf(key, instance),
      publishOperations: new Set(),
      registrations: [],
      provider: null,
      contribution: null,
      contributed: null,
      current: null,
      reported: { kind: 'idle', instance },
      timer: null,
      slot: null,
      status: 'reserved',
      quiescing: null,
    }
    records.set(key, entry)
    return succeed(entry)
  }

  /** Drops a reservation that never served: its runtime, its contribution and its record. */
  async function cancel(entry: InstanceRecord): Promise<void> {
    await retire(entry)
    if (entry.registrations.length === 0) records.delete(entry.key)
  }

  // --- the instance host -----------------------------------------------------------------------

  const directory: AgentDirectory<unknown> = {
    async resolve(request) {
      const found = directoryOf(ctx)
      return 'failure' in found ? found : found.ok.resolve(request)
    },
    async connect(request) {
      const found = directoryOf(ctx)
      return 'failure' in found ? found : found.ok.connect(request)
    },
  }

  const instanceHost: Host['instanceHost'] = {
    directory,
    async reserve(request) {
      const tenant = tenantTextOf(request.tenant)
      if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
      if ('failure' in decodeAgentOperationId(request.operation))
        return fail(invalid('operation', 'not an operation identity'))
      const scope = judgeEvidence(request.scope)
      if ('failure' in scope) return fail(invalid('scope', scope.failure.reason))
      const definition = judgeAdoption(request.definition)
      if ('failure' in definition) return fail(invalid('definition', definition.failure.reason))
      const refused = await qualify(request, 'reserve', {
        kind: 'scope',
        scope: scope.ok,
        definition: definition.ok,
      })
      if (refused !== undefined) return fail(refused)
      const text = dataText([request.principal, scope.ok, definition.ok])
      if (text === undefined) return fail(invalid('input', 'the input cannot be written as JSON'))
      const operationKey = keyOf(tenant, request.operation)
      const held = reserves.get(operationKey)
      if (held !== undefined)
        return held.text === text
          ? succeed(held.answer)
          : fail({ kind: 'conflict', operation: request.operation })
      const reserved = reserveChecked(request, tenant, scope.ok, definition.ok)
      if ('failure' in reserved) return reserved
      const answer = { instance: reserved.ok.instance, registration: reserved.ok.handle }
      reserves.set(operationKey, { text, answer })
      return succeed(answer)
    },
    async publish(request) {
      const tenant = tenantTextOf(request.tenant)
      if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
      if ('failure' in decodeAgentOperationId(request.operation))
        return fail(invalid('operation', 'not an operation identity'))
      if ('failure' in decodeAgentInstanceId(request.instance))
        return fail(invalid('instance', 'not an instance identity'))
      const scope = judgeEvidence(request.scope)
      if ('failure' in scope) return fail(invalid('scope', scope.failure.reason))
      const refused = await qualify(request, 'publish', {
        kind: 'instance',
        instance: request.instance,
      })
      if (refused !== undefined) return fail(refused)
      const entry = records.get(keyOf(tenant, request.instance))
      if (
        entry === undefined ||
        entry.status === 'retired' ||
        entry.scopeText !== dataText(scope.ok)
      )
        return fail(denied('publish'))
      return publishChecked(entry, request)
    },
    async withdraw(request) {
      const tenant = tenantTextOf(request.tenant)
      if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
      if ('failure' in decodeAgentOperationId(request.operation))
        return fail(invalid('operation', 'not an operation identity'))
      if ('failure' in decodeAgentRegistrationId(request.registration))
        return fail(invalid('registration', 'not a registration identity'))
      const refused = await qualify(request, 'withdraw', {
        kind: 'instance',
        instance: request.instance,
      })
      if (refused !== undefined) return fail(refused)
      const text = dataText([request.principal, request.instance, request.registration])
      if (text === undefined) return fail(invalid('input', 'the input cannot be written as JSON'))
      const operationKey = keyOf(tenant, request.operation)
      const held = withdrawals.get(operationKey)
      if (held !== undefined)
        return held.text === text
          ? succeed(held.answer)
          : fail({ kind: 'conflict', operation: request.operation })
      const answer = await withdrawChecked(request)
      if ('ok' in answer && answer.ok.state === 'withdrawn')
        withdrawals.set(operationKey, { text, answer: answer.ok })
      return answer
    },
    route(tenant, instance) {
      const text = tenantTextOf(tenant)
      const entry = text === undefined ? undefined : records.get(keyOf(text, instance))
      const provider = entry?.provider ?? null
      if (entry === undefined || provider === null || entry.current?.state !== 'published')
        return null
      if (entry.status === 'retired' || entry.status === 'reserved') return null
      return { runtime: provider.runtime, observation: provider.observation }
    },
  }

  // --- the publication authority ---------------------------------------------------------------

  const authority: AgentPublicationAuthority<unknown> = {
    check(request, caller) {
      const tenant = tenantTextOf(request.tenant)
      const entry = tenant === undefined ? undefined : records.get(keyOf(tenant, request.instance))
      const fiber = caller.fiber
      if ('registration' in request) {
        if (entry === undefined || !entry.registrations.includes(request.registration))
          return fail(denied('withdraw'))
        return fiber === ctx.fiber || fiber === entry.contributed?.fiber
          ? succeed(undefined)
          : fail(denied('withdraw'))
      }
      if (
        entry === undefined ||
        entry.status === 'retired' ||
        !entry.publishOperations.has(request.operation) ||
        entry.scopeText !== dataText(request.scope) ||
        fiber !== entry.contributed?.fiber
      )
        return fail(denied('publish'))
      return succeed(undefined)
    },
  }

  // --- the instance provision ------------------------------------------------------------------

  function judgeSlot(
    raw: AgentInstanceSlotInput<unknown>,
  ): Outcome<Readonly<{ slot: AgentInstanceSlotInput<unknown>; tenant: string }>, Failure> {
    try {
      const tenant = tenantTextOf(raw.tenant)
      if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
      const scope = judgeEvidence(raw.scope)
      if ('failure' in scope) return fail(invalid('scope', scope.failure.reason))
      const definition = judgeAdoption(raw.definition)
      if ('failure' in definition) return fail(invalid('definition', definition.failure.reason))
      return succeed({
        slot: {
          principal: raw.principal,
          tenant: raw.tenant,
          scope: scope.ok,
          definition: definition.ok,
        },
        tenant,
      })
    } catch {
      return fail(invalid('input', 'the input cannot be read'))
    }
  }

  function dependenciesOf(entry: InstanceRecord): AgentDependencies<unknown, ContentBlock> {
    return {
      ...statics,
      tools: stagePort<ToolRuntime<unknown, ContentBlock>>(ctx, toolRuntimeKey),
      extensions: stagePort(ctx, agentExtensionsKey),
      cards: stagePort(ctx, agentDecisionCardsKey),
      admission: stagePort(ctx, agentActionAdmissionKey),
      materials: stagePort(ctx, agentMaterialsKey),
      reads: stagePort(ctx, agentReadsKey),
      registration: entry.handle,
    }
  }

  /** Reserve, create, check the host principal, publish. It never rejects. */
  async function build(
    slot: AgentInstanceSlotInput<unknown>,
    tenant: string,
    slotKey: string,
  ): Promise<Outcome<Granted, Failure>> {
    try {
      const reserved = reserveChecked(slot, tenant, slot.scope, slot.definition)
      if ('failure' in reserved) return reserved
      const entry = reserved.ok
      const { instance } = entry
      const created = await factory(dependenciesOf(entry), {
        binding: { instance, tenant: slot.tenant, scope: slot.scope, definition: slot.definition },
        configuration: factoryConfiguration(config),
      })
      if ('failure' in created) {
        await cancel(entry)
        return created
      }
      entry.provider = created.ok
      const host: Access<unknown> = { principal, tenant: slot.tenant }
      const refused = await qualify(host, 'publish', { kind: 'instance', instance })
      const operation = mintOperation('publish')
      if (refused !== undefined || operation === undefined || stopped || closing) {
        await cancel(entry)
        return fail(refused ?? unavailable(OWNER, 'the host cannot publish now'))
      }
      const published = await publishChecked(entry, {
        ...host,
        operation,
        instance,
        scope: slot.scope,
        state: { kind: 'idle', instance },
      })
      if ('failure' in published) {
        await cancel(entry)
        return published
      }
      entry.slot = slotKey
      slots.set(slotKey, entry)
      if (entry.reported.kind === 'idle') arm(entry)
      return succeed({ instance, registration: published.ok })
    } catch (error) {
      record('error', `an instance could not be built: ${describe(error)}`)
      return fail(unavailable(OWNER, 'the instance could not be built'))
    }
  }

  const provision: AgentInstanceProvision<unknown> = {
    async acquire(raw) {
      // After the ordered stop began, no slot answers, not even one with a published instance.
      if (closing || stopped) return fail(unavailable(OWNER, CLOSED))
      const judged = judgeSlot(raw)
      if ('failure' in judged) return judged
      const { slot, tenant } = judged.ok
      const refused = await qualify(slot, 'reserve', {
        kind: 'scope',
        scope: slot.scope,
        definition: slot.definition,
      })
      if (refused !== undefined) return fail(refused)
      const slotKey = JSON.stringify([tenant, dataText(slot.scope), dataText(slot.definition)])
      const held = slots.get(slotKey)
      if (held?.status === 'published' && held.current?.state === 'published')
        return succeed({ instance: held.instance, registration: held.current })
      const shared = building.get(slotKey)
      if (shared !== undefined) return shared
      const started = build(slot, tenant, slotKey)
      building.set(slotKey, started)
      void started.then(() => building.delete(slotKey))
      return started
    },
  }

  // --- the recovery and control entries --------------------------------------------------------

  /** One Journal call after the check; a throw is `unavailable`, never a made-up answer. */
  async function throughJournal<T>(
    request: Access<unknown>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
    call: () => Reply<T>,
  ): Reply<T> {
    if (tenantTextOf(request.tenant) === undefined)
      return fail(invalid('tenant', 'not made by the identity parser'))
    const refused = await qualify(request, operation, target)
    if (refused !== undefined) return fail(refused)
    try {
      return await call()
    } catch (error) {
      record('error', `agentJournal threw for ${operation}: ${describe(error)}`)
      return fail(unavailable('agentJournal', `the Journal gave no answer to ${operation}`))
    }
  }

  const onExecution = (execution: Parameters<AgentJournal<unknown>['load']>[0]['execution']) =>
    ({ kind: 'execution', execution }) as const

  /** The record of `instance` when this host still runs its runtime. */
  function liveRuntimeOf(tenant: TenantId, instance: AgentInstanceId): InstanceRecord | undefined {
    const text = tenantTextOf(tenant)
    const entry = text === undefined ? undefined : records.get(keyOf(text, instance))
    return entry !== undefined && entry.provider !== null && entry.status !== 'retired'
      ? entry
      : undefined
  }

  /**
   * Advances an accepted control as the execution handle does, when the active attachment of the
   * execution belongs to a runtime that this host still runs: the advance uses the dependencies of
   * that runtime. With no such runtime the accepted control stays as the Journal saved it, for the
   * recovery path. A failure is returned; the caller retries with the same control operation, and
   * the advance recognizes every step it already saved.
   */
  async function advanceHeld(
    request: Parameters<AgentExecutionControl<unknown>['control']>[0],
  ): Reply<void> {
    const access: Access<unknown> = { principal: request.principal, tenant: request.tenant }
    try {
      const loaded = await statics.journal.load({ ...access, execution: request.execution })
      if ('failure' in loaded) return loaded
      const attachment = loaded.ok.executionAttachment
      const entry =
        attachment === null ? undefined : liveRuntimeOf(request.tenant, attachment.instance)
      if (entry === undefined) return succeed(undefined)
      return await advanceControl(
        dependenciesOf(entry),
        access,
        request.execution,
        request.operation,
      )
    } catch (error) {
      record('error', `the control ${request.operation} could not be advanced: ${describe(error)}`)
      return fail(unavailable(OWNER, `the control ${request.operation} could not be advanced`))
    }
  }

  const recovery: AgentExecutionRecovery<unknown> = {
    query: request =>
      throughJournal(request, 'query', onExecution(request.execution), () =>
        statics.journal.query(request),
      ),
    load: request =>
      throughJournal(request, 'load', onExecution(request.execution), () =>
        statics.journal.load(request),
      ),
    reconcile: request =>
      throughJournal(request, 'reconcile', onExecution(request.execution), async () =>
        fail(
          unavailable(
            OWNER,
            'reconcile through the recovery entry is not implemented yet (#502 stage 5)',
          ),
        ),
      ),
    detach: request =>
      throughJournal(request, 'detach', onExecution(request.execution), async () => {
        // SPEC "恢复与接管": the active attachment of a runtime that still runs needs takeover too.
        if (liveRuntimeOf(request.tenant, request.authority.instance) !== undefined) {
          const refused = await qualify(request, 'takeover', onExecution(request.execution))
          if (refused !== undefined) return fail(refused)
        }
        return statics.journal.detach(request)
      }),
  }

  const control: AgentExecutionControl<unknown> = {
    async control(request) {
      const accepted = await throughJournal(
        request,
        'control',
        onExecution(request.execution),
        () => statics.journal.control(request),
      )
      if ('failure' in accepted) return accepted
      const advanced = await advanceHeld(request)
      return 'failure' in advanced ? advanced : accepted
    },
  }

  // --- the ordered stop ------------------------------------------------------------------------

  /** Resolves `'deadline'` when the signal aborts; `release` drops the listener. */
  function deadlineOf(signal: AbortSignal) {
    let release = () => {}
    const reached = new Promise<'deadline'>(resolve => {
      if (signal.aborted) return resolve('deadline')
      const abort = () => resolve('deadline')
      signal.addEventListener('abort', abort, { once: true })
      release = () => signal.removeEventListener('abort', abort)
    })
    return { reached, release: () => release() }
  }

  /** The reason an instance did not end, or undefined when its quiesce drained in time. */
  async function judged(
    pending: Promise<Quiesced>,
    reached: Promise<'deadline'>,
  ): Promise<string | undefined> {
    const answer = await Promise.race([pending, reached])
    return answer === 'deadline' ? 'quiesce gave no answer before the deadline' : notDrained(answer)
  }

  async function quiesceAll({ signal }: AgentHostStopInput): Promise<AgentHostStopResult> {
    closing = true
    for (const entry of records.values()) disarm(entry)
    const { reached, release } = deadlineOf(signal)
    const unsettled: AgentHostUnsettled[] = []
    try {
      // A build that passed its admission check before the stop publishes or cancels; wait for it.
      const builds = [...building.values()]
      if (builds.length > 0) {
        const done = await Promise.race([Promise.all(builds).then(() => 'built' as const), reached])
        if (done === 'deadline')
          unsettled.push({
            instance: null,
            reason: `${building.size} instance build(s) had not finished before the deadline`,
          })
      }
      const waits: Promise<void>[] = []
      for (const entry of records.values()) {
        const note = (reason: string | undefined) => {
          if (reason !== undefined) unsettled.push({ instance: entry.instance, reason })
        }
        if (entry.quiescing !== null) {
          waits.push(judged(entry.quiescing, reached).then(note))
          continue
        }
        if (entry.status !== 'published') continue
        const { provider } = entry
        if (provider === null) {
          if (entry.current?.state === 'published')
            note('published by another caller; the host holds no runtime to quiesce')
          continue
        }
        const pending = quiesceNow(entry, provider, stopReason(entry.instance), false)
        if (pending === undefined) note('no quiesce operation could be made')
        else waits.push(judged(pending, reached).then(note))
      }
      await Promise.all(waits)
    } catch (error) {
      unsettled.push({ instance: null, reason: `the ordered stop failed: ${describe(error)}` })
    } finally {
      release()
    }
    if (unsettled.length === 0) {
      record('info', 'ordered stop: every instance drained')
      return { kind: 'settled' }
    }
    const detail = unsettled
      .map(({ instance, reason }) => `${instance ?? 'build'}: ${reason}`)
      .join('; ')
    record('error', `ordered stop left ${unsettled.length} unsettled: ${detail}`)
    return { kind: 'incomplete', detail, instances: unsettled }
  }

  return {
    instanceHost,
    authority,
    recovery,
    control,
    provision,
    retired(tenant, instance, generation, reason) {
      const text = tenantTextOf(tenant)
      const entry = text === undefined ? undefined : records.get(keyOf(text, instance))
      if (entry === undefined || reason === 'superseded') return
      const current = entry.current
      if (current !== null && generation === entry.registrations.length)
        entry.current = { registration: current.registration, state: 'withdrawn' }
    },
    quiesceAll,
    stop() {
      stopped = true
      for (const entry of records.values()) disarm(entry)
    },
  }
}
