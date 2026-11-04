// The `agentJournal` plugin of the session-log Journal on real Cordis 4.0.4. What is checked: it
// provides the key only with storage, the trusted tenant domain lookup and the Session access check
// present, and removes it on stop; a reference held from before answers unavailable. A call is
// routed by its tenant and execution to the session whose Run started that execution, so two
// sessions with an execution each do not mix; the route is cached in-process and a new instance
// rebuilds it from storage. An execution no Run started and an execution of another tenant get the
// same `denied` and nothing is written; an unreadable index is `unavailable`, never `denied`. The
// Agent contract's core Journal suite passes through the plugin over the Session log in SQL (the
// node:sqlite double of the published modules), and routing holds on the real sqlite-provider.
// The same plugin body also provides `agentJournalEntries` and `agentMaterials`: the three keys
// belong to the plugin's own fiber and go together; a received delivery is one fact to the three;
// a record whose reply was lost is decided by the Journal of the same provider; a material read goes
// to the session its source names and waits for a write of that session in flight, and `preserve`,
// which names no session, is unavailable.
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeInputId,
  type AcceptedInput,
  type AgentJournal,
  type AgentJournalEntries,
  type AgentMaterials,
  type AgentReceivedCommits,
  type AgentReceivedRecords,
  type DurableEvidence,
  type Material,
  type ModelReceptionTargets,
  type ToolReceptionTargets,
  type PendingCall,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  agentJournalCoreConformance,
  createTestCancellationPolicy,
  sampleReceivedModelResult,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
} from '@omne-harness/agent-contract/testing'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentModelReceptionTargetsKey,
  agentReceivedCommitsKey,
  agentReceivedRecordsKey,
  agentToolReceptionTargetsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  SessionAccess,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionCommand,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  testingTenant,
} from '@omne-harness/session-contract/testing'
import type { SessionAdoptedRequests } from '@omne-harness/session-cordis-contract'
import {
  SessionAccessCheckService,
  sessionAdoptedRequestsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { DomainRef, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createSessionLogJournal, materialSessionOf } from '../src/cordis/agent-journal.ts'
import {
  createExecutionRoutedJournal,
  createSessionAgentJournalPlugin,
  SessionLogAgentJournalProvider,
  type ExecutionRoutedJournalOptions,
} from '../src/cordis/agent-journal-provider.ts'
import { checkpoint, instance, ok, openInput, operation } from './fixtures/common-journal.ts'
import {
  handed,
  nextRun,
  sqlScene,
  type SqlScene,
  type SqlSceneOptions,
} from './fixtures/sql-scene.ts'
import { m0Checkpoint } from './fixtures/adopted-request.ts'
import { toolCall } from './fixtures/tool-call.ts'

// `FiberState` is a const enum of Cordis, so its members are not values to import: in Cordis 4.0.4
// 0 is PENDING, 2 is ACTIVE and 3 is FAILED.
const PENDING = 0
const ACTIVE = 2
const FAILED = 3

/** The three keys one provider serves in one authoritative ordering (assembly row `agent-journal`). */
const FACES = [agentJournalKey, agentJournalEntriesKey, agentMaterialsKey] as const

const other = memoryOtherAccess('intruder', 'route-other')
const textOf = (tenant: SessionAccess<string>['tenant']) => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

/** How the next storage commit fails: it runs and its reply is lost, or it never runs. */
type Fault = 'applied' | 'dropped' | 'pending'

type Wiring = {
  /** Makes reads of the execution index answer `unavailable` while true. */
  failIndex: boolean
  /** Every read of the execution index, by the tenant it named. */
  indexReads: string[]
  /** How many storage reads the plugin made, of any handler. */
  reads: number
  /** The fault of the next storage commit, if any; the commit takes it. */
  fault: Fault | null
  /** When set, the next storage commit takes it, calls `reached` and waits for `released`. */
  hold: Readonly<{ reached: () => void; released: Promise<void> }> | null
  /** The decision of the Session access check; every request is allowed when absent. */
  decide?: ((request: SessionAccessRequest<unknown>) => SessionAccessDecision) | undefined
  /** Every request the Session access check decided. */
  decided: SessionAccessRequest<unknown>[]
}

/**
 * Cordis services over the scene's storage: `storage` (counting and optionally failing the index
 * reads), a trusted lookup that knows the scene's tenant and the other tenant, and a Session access
 * check that allows everything.
 */
function servicesOf(s: SqlScene, otherDomain: DomainRef) {
  const wiring: Wiring = {
    failIndex: false,
    indexReads: [],
    reads: 0,
    fault: null,
    hold: null,
    decided: [],
  }
  const storage: SqlStorage = s.storage
  // The operations whose commit never ran and whose outcome stays undecided (`pending`).
  const undecided = new Set<string>()
  const wrapped: SqlStorage = {
    registerCombination: input => storage.registerCombination(input),
    commit: async (input, options) => {
      const hold = wiring.hold
      wiring.hold = null
      if (hold !== null) {
        hold.reached()
        await hold.released
      }
      const fault = wiring.fault
      wiring.fault = null
      if (fault === null) return storage.commit(input, options)
      if (fault === 'applied') await storage.commit(input, options)
      if (fault === 'pending') undecided.add(input.identity.operation)
      return { kind: 'unknown', identity: input.identity, diagnostic: `scripted ${fault}` }
    },
    query: identity =>
      undecided.has(identity.operation)
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'scripted pending' })
        : storage.query(identity),
    read: (request, options) => {
      wiring.reads += 1
      if (request.handler === 'session.execution') {
        wiring.indexReads.push(String((request.input as { tenant?: unknown }).tenant))
        if (wiring.failIndex)
          return Promise.resolve({
            kind: 'unavailable',
            requestKey: request.requestKey,
            reason: 'read_failed',
            diagnostic: null,
          } as never)
      }
      return storage.read(request, options)
    },
  }
  class Storage extends StorageService {
    readonly registerCombination = wrapped.registerCombination
    readonly commit = wrapped.commit
    readonly query = wrapped.query
    readonly read = wrapped.read
  }
  const lookup: TenantDomainLookup['lookup'] = input =>
    Promise.resolve(
      input.tenant === s.domain.scope.tenant
        ? { kind: 'ready', domain: s.domain }
        : input.tenant === textOf(other.tenant)
          ? { kind: 'ready', domain: otherDomain }
          : { kind: 'unregistered' },
    )
  class Lookup extends TenantDomainLookupService {
    readonly lookup = lookup
  }
  const check = (request: SessionAccessRequest<unknown>): Promise<SessionAccessDecision> => {
    wiring.decided.push(request)
    return Promise.resolve(
      wiring.decide?.(request) ?? {
        kind: 'allowed',
        evidence: evidence(`access/${request.operation}`),
      },
    )
  }
  class Access extends SessionAccessCheckService<unknown> {
    readonly check = check
  }
  return { wiring, Storage, Lookup, Access, storage: wrapped, lookup: { lookup }, check }
}

/** The domain of the other tenant; on the real provider it is registered with the same combination. */
async function otherDomainOf(s: SqlScene): Promise<DomainRef> {
  const domain: DomainRef = {
    scope: { kind: 'tenant', tenant: textOf(other.tenant) },
    transactionDomain: 'dom_1',
  }
  const registered = await s.storage.registerCombination({
    ...domain,
    ...s.combination,
    participants: [...SESSION_LOG_PARTICIPANTS],
  })
  if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
  return domain
}

async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0], config?: unknown) {
  const fiber = await ctx.plugin(plugin, config as never)
  disposers.push(() => fiber.dispose())
  return fiber
}

/** A real Cordis root with the three dependencies and the plugin, over the scene's storage. */
async function assembled(
  s: SqlScene,
  config: Readonly<{ routeCacheEntries?: number }> = {},
  provider: Parameters<Context['plugin']>[0] = SessionLogAgentJournalProvider,
) {
  const services = servicesOf(s, await otherDomainOf(s))
  const ctx = new Context()
  await mount(ctx, services.Storage)
  await mount(ctx, services.Lookup)
  await mount(ctx, services.Access)
  const plugin = await mount(ctx, provider, { ...s.combination, ...config })
  const face = <T>(key: string) => {
    const found: unknown = ctx.get(key)
    if (found === undefined) throw new Error(`${key} is not provided`)
    return found as T
  }
  const journal = () => face<AgentJournal<string>>(agentJournalKey)
  const entries = () => face<AgentJournalEntries<string>>(agentJournalEntriesKey)
  const materials = () => face<AgentMaterials<string, ContentBlock>>(agentMaterialsKey)
  const adopted = () => face<SessionAdoptedRequests<unknown>>(sessionAdoptedRequestsKey)
  const received = () => face<AgentReceivedCommits<string, ContentBlock>>(agentReceivedCommitsKey)
  const targets = () => face<ModelReceptionTargets<string>>(agentModelReceptionTargetsKey)
  const toolTargets = () => face<ToolReceptionTargets<string>>(agentToolReceptionTargetsKey)
  const records = () => face<AgentReceivedRecords<string>>(agentReceivedRecordsKey)
  return {
    ctx,
    plugin,
    journal,
    entries,
    materials,
    adopted,
    received,
    targets,
    toolTargets,
    records,
    wiring: services.wiring,
  }
}

/** The trusted cancellation installation of the test policy, as the assembly entry hands it in. */
type TestCancellation = Readonly<{
  installation: typeof testCancellationPolicyInstallation
  policy: ReturnType<typeof createTestCancellationPolicy>
}>
const testCancellation = (): TestCancellation => ({
  installation: testCancellationPolicyInstallation,
  policy: createTestCancellationPolicy(),
})

/**
 * The Journal of the scene's session without the plugin: `createSessionLogJournal(...).forSession`
 * over the same scripted storage, so the core suite can tell a fault of the provider from one of
 * the plugin's routing.
 */
async function direct(s: SqlScene, cancellation?: TestCancellation) {
  const services = servicesOf(s, await otherDomainOf(s))
  const journal = createSessionLogJournal<string>({
    storage: services.storage,
    tenantDomainLookup: services.lookup,
    sessionAccessCheck: { check: services.check },
    combination: s.combination,
    ...(cancellation === undefined ? {} : { cancellation }),
  }).forSession(s.access).journal
  return { journal: () => journal, wiring: services.wiring }
}

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

async function scene(name: string, options: SqlSceneOptions = {}) {
  const s = await sqlScene(name, options)
  scenes.push(s)
  return s
}

/**
 * A second session of the scene's tenant on the same storage, created and with a started Run, as
 * the scene builds its own: its execution and the input that opens it.
 */
async function secondSession(s: SqlScene, name: string) {
  const access = memoryAccess('tester', name)
  const value = creation({ initial: ordinaryInput('input-1') })
  const create: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId(`create-${name}`),
      creation: value,
    },
  }
  ok(
    await s.port.commit({
      access,
      command: create,
      guards: [
        initializationFixtureGuard(
          initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
        ),
      ],
    }),
  )
  const started = ok(
    await s.port.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId(`start-${name}`),
          entry: 'interactive',
          candidate: value.definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [guard('evidence-bridge', 'login-entry', { session: name, operation: 'start' })],
    }),
  )
  const snapshot = ok(await s.port.readWork(access))
  if (snapshot.run.kind !== 'active') throw new Error('not active')
  const execution = ok(decodeAgentExecutionId(snapshot.run.execution.execution))
  const admitted = ok(await s.port.readInput({ ...access, input: snapshot.run.first }))
  const initial: AcceptedInput = {
    id: ok(decodeInputId(admitted.input)),
    content: admitted.message,
    // AD-14: the source basis of the initial input is the receipt of SE13 (PA-01 item 1).
    source: started.receipt.source,
    priority: 'ordinary',
  }
  return {
    access,
    execution,
    openInput: openInput({
      access,
      execution,
      operation: operation(`open-${name}`),
      instance: instance(),
      grant: started.receipt.source,
      initial,
      checkpoint: checkpoint(),
    }),
  }
}

const sessionOf = (s: SqlScene, execution: string): unknown =>
  s.controls?.select(`SELECT session FROM er_execution WHERE execution = '${execution}' LIMIT 1`)
    .rows[0]?.[0]

describe('loading and stopping on real Cordis', () => {
  it('provides agentJournal with its three dependencies and removes the key when the plugin stops', async () => {
    const s = await scene('route-load')
    const { ctx, plugin } = await assembled(s)
    expect(agentJournalKey).toBe('agentJournal')
    expect(plugin.state).toBe(ACTIVE)
    expect(ctx.get(agentJournalKey)).toBeDefined()
    await plugin.dispose()
    expect(ctx.get(agentJournalKey)).toBeUndefined()
  })

  for (const absent of ['storage', 'tenantDomainLookup', 'sessionAccessCheck'] as const)
    it(`stays PENDING without ${absent} and becomes active when it arrives`, async () => {
      const s = await scene(`route-pending-${absent}`)
      const services = servicesOf(s, await otherDomainOf(s))
      const providers = {
        storage: services.Storage,
        tenantDomainLookup: services.Lookup,
        sessionAccessCheck: services.Access,
      }
      const ctx = new Context()
      for (const [key, plugin] of Object.entries(providers))
        if (key !== absent) await mount(ctx, plugin)
      const fiber = await mount(ctx, SessionLogAgentJournalProvider, s.combination)
      expect(fiber.state).toBe(PENDING)
      for (const key of FACES) expect(ctx.get(key), key).toBeUndefined()
      await mount(ctx, providers[absent])
      expect(fiber.state).toBe(ACTIVE)
      for (const key of FACES) expect(ctx.get(key), key).toBeDefined()
    })

  it('fails to load, and provides nothing, without a valid declared combination', async () => {
    const s = await scene('route-config')
    const services = servicesOf(s, await otherDomainOf(s))
    for (const config of [
      undefined,
      { combinationVersion: 'c1' },
      { combinationVersion: '', manifestDigest: s.combination.manifestDigest },
      { ...s.combination, manifestDigest: 'not-a-digest' },
      { ...s.combination, routeCacheEntries: 0 },
    ]) {
      const ctx = new Context()
      await mount(ctx, services.Storage)
      await mount(ctx, services.Lookup)
      await mount(ctx, services.Access)
      // The wrapper `ctx.plugin` returns is a thenable that rejects when the load fails; the fiber
      // under it is not.
      const wrapped = ctx.plugin(SessionLogAgentJournalProvider, config as never)
      const fiber = Object.getPrototypeOf(wrapped) as Awaited<typeof wrapped>
      disposers.push(() => fiber.dispose())
      await fiber.await().catch(() => undefined)
      expect(fiber.state, JSON.stringify(config)).toBe(FAILED)
      expect(ctx.get(agentJournalKey)).toBeUndefined()
      // The schema refused it: the error is Cordis's validation error, not one the body raised.
      await expect(fiber.await()).rejects.toMatchObject({ name: 'ValidationError' })
    }
  })

  it('answers unavailable through a reference held after the plugin stopped, and writes nothing', async () => {
    const s = await scene('route-held')
    const { plugin, journal } = await assembled(s)
    const held = journal()
    ok(await held.open(s.openInput))
    const commits = s.commits.length
    await plugin.dispose()
    expect(await held.load({ ...s.access, execution: s.execution })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-log-journal' },
    })
    expect(s.commits.length).toBe(commits)
  })

  it('declares the capabilities of the session-log Journal it routes to', async () => {
    const s = await scene('route-capabilities')
    const { journal } = await assembled(s)
    const direct = createSessionLogJournal<string>({
      storage: s.storage,
      tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'unregistered' }) },
      sessionAccessCheck: { check: () => Promise.resolve({ kind: 'denied' }) },
      combination: s.combination,
    }).forSession(s.access).journal.capabilities
    expect(journal().capabilities.coordination).toBe(direct.coordination)
    expect([...journal().capabilities.participants].sort()).toEqual([...direct.participants].sort())
  })
})

describe('routing by tenant and execution', () => {
  it('opens and loads the execution of each of two sessions on its own session log', async () => {
    const s = await scene('route-a')
    const b = await secondSession(s, 'route-b')
    const { journal } = await assembled(s)
    const openedA = ok(await journal().open(s.openInput))
    const openedB = ok(await journal().open(b.openInput))
    expect(sessionOf(s, s.execution)).toBe(String(s.access.session))
    expect(sessionOf(s, b.execution)).toBe(String(b.access.session))

    // A write on A moves A only: the Agent of A takes its initial input.
    const before = ok(await journal().load({ ...b.access, execution: b.execution }))
    const loaded = ok(await journal().load({ ...s.access, execution: s.execution }))
    const page = ok(
      await journal().inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
    ok(
      await journal().commit({
        ...s.access,
        execution: s.execution,
        operation: operation('route-a-take'),
        authority: openedA.authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
        state: { kind: 'advancing' },
        events: [{ kind: 'input-taken', batch: page.batch }],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const afterA = ok(await journal().load({ ...s.access, execution: s.execution }))
    const afterB = ok(await journal().load({ ...b.access, execution: b.execution }))
    expect(afterA.revision).not.toBe(loaded.revision)
    expect(afterB.revision).toBe(before.revision)
    expect(openedB.receipt.execution).toBe(b.execution)
  })

  it('reads the index once per execution, and a new instance rebuilds the route from storage', async () => {
    const s = await scene('route-cache')
    const first = await assembled(s)
    ok(await first.journal().open(s.openInput))
    const reload = () => first.journal().load({ ...s.access, execution: s.execution })
    const loaded = ok(await reload())
    ok(await reload())
    expect(first.wiring.indexReads).toEqual([s.domain.scope.tenant])

    // A second plugin instance on the same storage has an empty cache and finds the same session.
    const second = await assembled(s)
    const again = ok(await second.journal().load({ ...s.access, execution: s.execution }))
    expect(second.wiring.indexReads).toEqual([s.domain.scope.tenant])
    expect(again.revision).toBe(loaded.revision)
  })

  it('keeps routing correctly past the bound of its route cache', async () => {
    const s = await scene('route-bound')
    const b = await secondSession(s, 'route-bound-b')
    const { journal, wiring } = await assembled(s, { routeCacheEntries: 1 })
    ok(await journal().open(s.openInput))
    ok(await journal().open(b.openInput))
    for (let round = 0; round < 2; round += 1) {
      expect(ok(await journal().load({ ...s.access, execution: s.execution })).revision).toBe('1')
      expect(ok(await journal().load({ ...b.access, execution: b.execution })).revision).toBe('1')
    }
    // Each load after the other session's evicted the route reads the index again.
    expect(wiring.indexReads).toHaveLength(6)
  })
})

describe('an execution that is not the caller tenant’s', () => {
  it('an execution no Run started and an execution of another tenant get the same denied, and nothing is written', async () => {
    const s = await scene('route-denied')
    const { journal, wiring } = await assembled(s)
    const opened = ok(await journal().open(s.openInput))
    const commits = s.commits.length
    const unknown = ok(decodeAgentExecutionId('run_never/execution'))
    const calls: [
      string,
      (execution: typeof unknown, access: typeof s.access) => Promise<unknown>,
    ][] = [
      ['open', (execution, access) => journal().open({ ...s.openInput, ...access, execution })],
      ['load', (execution, access) => journal().load({ ...access, execution })],
      [
        'query',
        (execution, access) =>
          journal().query({ ...access, execution, operation: operation('route-query') }),
      ],
      [
        'commit',
        (execution, access) =>
          journal().commit({
            ...access,
            execution,
            operation: operation('route-denied-commit'),
            authority: opened.authority,
            expected: opened.receipt.revision,
            checkpoint: s.checkpoint,
            state: { kind: 'advancing' },
            events: [],
            effects: [],
            caller: { kind: 'none' },
            replyAdmission: null,
            handoff: null,
            finish: null,
          }),
      ],
      [
        'read',
        (execution, access) =>
          journal().output.read({ ...access, execution, after: null, limit: 10 }),
      ],
      [
        'events',
        async (execution, access) => {
          const answers: unknown[] = []
          const signal = new AbortController().signal
          for await (const answer of journal().output.events({
            ...access,
            execution,
            after: null,
            signal,
          }))
            answers.push(answer)
          return answers
        },
      ],
    ]
    for (const [action, call] of calls) {
      // The scene's execution is in the route cache now, under the scene's tenant only.
      const foreign = await call(s.execution, other)
      const never = await call(unknown, s.access)
      const expected = { failure: { kind: 'denied', action } }
      expect(foreign, action).toEqual(action === 'events' ? [expected] : expected)
      expect(never, action).toEqual(foreign)
    }
    expect(s.commits.length).toBe(commits)
    // The route the scene's tenant cached is not the other tenant's: each of its calls read the
    // index under its own tenant.
    expect(wiring.indexReads.filter(tenant => tenant === textOf(other.tenant))).toHaveLength(
      calls.length,
    )
  })

  it('an index that cannot be read is unavailable, never denied; an unregistered tenant is unavailable', async () => {
    const s = await scene('route-unreadable')
    const { journal, wiring } = await assembled(s)
    wiring.failIndex = true
    expect(await journal().open(s.openInput)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-log-journal' },
    })
    wiring.failIndex = false
    ok(await journal().open(s.openInput))

    const commits = s.commits.length
    const stranger = {
      ...s.access,
      tenant: testingTenant('org_c0nf0rmance0thr33000000000', 'acc_c0nf0rmance0thr33000000000'),
    }
    expect(await journal().load({ ...stranger, execution: s.execution })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-log-journal' },
    })
    expect(s.commits.length).toBe(commits)
  })
})

// --- the entries and materials faces --------------------------------------------------------------

const unavailableHere = { failure: { kind: 'unavailable', owner: 'session-log-journal' } }
const CONSUMER = { owner: 'suite', work: 'work', position: 'at', purpose: 'action' }

function factsMaterial(name: string): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
    value: { kind: 'string', value: name },
  }
}

/**
 * Opens the scene's execution through the plugin and makes it wait on one Model call, so the call's
 * consumption is bound to the execution. Returns the delivery of that call without its material.
 */
async function waitingOnModel(
  s: SqlScene,
  journal: AgentJournal<string>,
  name: string,
  quiet = false,
): Promise<Omit<ReceivedEntry, 'material'>> {
  const opened = ok(await journal.open(s.openInput))
  const result = sampleReceivedModelResult(s.access.tenant, name)
  if (result.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: ok(decodeActionId('action')),
    reference: result.delivery.key.reference,
    consumption: result.consumption,
    position: result.consumer,
    fixed: evidence('request'),
  }
  const waits = [{ kind: 'producer' as const, pending }]
  ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`pending-${name}`),
      authority: opened.authority,
      expected: opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [pending] },
      // `quiet`: no event, so the Session history of the Run needs no original of it (a next Run
      // of the session reads that history).
      state: quiet ? { kind: 'advancing' } : { kind: 'waiting', waits },
      events: quiet ? [] : [{ kind: 'waiting', waits }],
      effects: [{ pending, action: pending.action, authority: opened.authority }],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const { material: _material, ...draft } = result
  return draft
}

// R2-D237: the two faces the host's Model result receiver needs. Each case is red when the plugin
// stops providing the face, routes it to the wrong session, or answers from the live checkpoint.
describe('agentReceivedCommits and agentModelReceptionTargets: the result receiver faces', () => {
  it('commits a received delivery routed by its execution, as one fact the Journal reads', async () => {
    const s = await scene('recv-commit')
    const { plugin, journal, entries, received } = await assembled(s)
    for (const key of [agentReceivedCommitsKey, agentModelReceptionTargetsKey])
      expect(plugin.store?.[key]?.fiber === plugin, key).toBe(true)
    const draft = await waitingOnModel(s, journal(), 'recv-commit')
    const input = {
      ...s.access,
      execution: s.execution,
      operation: operation('receive'),
      entry: draft,
      material: factsMaterial('recv-commit'),
    }
    const saved = ok(await received().commit(input))
    if (saved.kind !== 'committed') throw new Error(`received ${saved.kind}`)
    const loaded = ok(await journal().load({ ...s.access, execution: s.execution }))
    const read = ok(
      await entries().read({ ...s.access, execution: s.execution, after: null, limit: 100 }),
    )
    expect(read.items.map(item => item.entry)).toContainEqual(saved.value.entry)
    // The same operation is recognized: the original commit, no second fact.
    expect(ok(await received().commit(input))).toEqual(saved)
    expect(ok(await received().query(input))).toEqual(saved)
    expect(ok(await journal().load({ ...s.access, execution: s.execution })).revision).toBe(
      loaded.revision,
    )
    // An execution no Run started: denied, nothing written.
    const unknown = ok(decodeAgentExecutionId('recv-nobody'))
    expect(await received().commit({ ...input, execution: unknown })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })

  // R2-D257: the read face the Agent owner's evidence adapter confirms a Model ACK through. Red
  // when the plugin does not provide it in its own fiber, when it answers something other than the
  // committed record, or when a new instance on the same storage no longer finds the record.
  it('agentReceivedRecords answers the committed record, also from a new instance on the same storage', async () => {
    const s = await scene('recv-records')
    const first = await assembled(s)
    expect(first.plugin.store?.[agentReceivedRecordsKey]?.fiber === first.plugin).toBe(true)
    const draft = await waitingOnModel(s, first.journal(), 'recv-records')
    const input = {
      ...s.access,
      execution: s.execution,
      operation: operation('receive-records'),
      entry: draft,
      material: factsMaterial('recv-records'),
    }
    const absent = { ...input, operation: operation('receive-never') }
    expect(ok(await first.records().query(absent))).toEqual({ kind: 'unknown' })
    const saved = ok(await first.received().commit(input))
    if (saved.kind !== 'committed') throw new Error(`received ${saved.kind}`)
    const revision = ok(
      await first.journal().load({ ...s.access, execution: s.execution }),
    ).revision
    expect(ok(await first.records().query(input))).toEqual(saved)
    // A read writes nothing.
    expect(ok(await first.journal().load({ ...s.access, execution: s.execution })).revision).toBe(
      revision,
    )
    await first.plugin.dispose()
    const second = await assembled(s)
    expect(ok(await second.records().query(input))).toEqual(saved)
  })

  it('answers the binding the committed PendingCall made, after the call left the checkpoint and in a new instance', async () => {
    const s = await scene('recv-targets')
    const first = await assembled(s)
    const draft = await waitingOnModel(s, first.journal(), 'recv-targets')
    const pending = draft.delivery.producer === 'model' ? draft.delivery.key.reference : null
    if (pending === null) throw new Error('fixture: a Model entry')
    const all = ok(await first.targets().forExecution({ access: s.access, execution: s.execution }))
    expect(all).toHaveLength(1)
    const [target] = all
    expect(target?.execution).toBe(s.execution)
    expect(target?.pending.reference).toBe(pending)
    const attached = ok(await first.journal().load({ ...s.access, execution: s.execution }))
    expect(target?.instance).toBe(attached.executionAttachment?.instance)
    const query = { access: s.access, consumer: draft.consumer, reference: pending }
    expect(ok(await first.targets().resolve({ ...query, execution: s.execution }))).toEqual(target)

    // The checkpoint drops the call; the binding stays.
    const loaded = ok(await first.journal().load({ ...s.access, execution: s.execution }))
    const attach = loaded.executionAttachment
    if (attach === null) throw new Error('fixture: attached')
    ok(
      await first.journal().commit({
        ...s.access,
        execution: s.execution,
        operation: operation('drop-call'),
        authority: attach,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, calls: [] },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    expect(ok(await first.targets().resolve({ ...query, execution: s.execution }))).toEqual(target)

    // A new plugin instance on the same storage reads the binding from the session's records.
    await first.plugin.dispose()
    const second = await assembled(s)
    expect(ok(await second.targets().resolve({ ...query, execution: s.execution }))).toEqual(target)
    expect(
      ok(await second.targets().forExecution({ access: s.access, execution: s.execution })),
    ).toEqual([target])
  })

  it('a resolve without a route, or routed to an execution that holds no such binding, is denied', async () => {
    const s = await scene('recv-route')
    const { journal, targets } = await assembled(s)
    const draft = await waitingOnModel(s, journal(), 'recv-route')
    if (draft.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
    const query = {
      access: s.access,
      consumer: draft.consumer,
      reference: draft.delivery.key.reference,
    }
    expect(await targets().resolve(query)).toHaveProperty('failure.kind', 'denied')
    const nobody = ok(decodeAgentExecutionId('recv-route-nobody'))
    expect(await targets().resolve({ ...query, execution: nobody })).toHaveProperty(
      'failure.kind',
      'denied',
    )
    expect(await targets().forExecution({ access: other, execution: s.execution })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })

  // R2-D250 N3. Red when a route to another execution of the same session reads the binding of the
  // first one: both routes reach the same session log, so only the execution of the binding tells.
  // The execution index routes the sibling to the same session as soon as its Run started. The session
  // core and the plugin both compare the execution; the case turns red when neither does.
  it('a route to another execution of the same session does not resolve the binding of the first', async () => {
    const s = await scene('recv-sibling')
    const { journal, targets } = await assembled(s)
    const draft = await waitingOnModel(s, journal(), 'recv-sibling', true)
    if (draft.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
    const sibling = await nextRun(s, 2)
    expect(sibling.execution).not.toBe(s.execution)
    const query = {
      access: s.access,
      consumer: draft.consumer,
      reference: draft.delivery.key.reference,
    }
    expect(ok(await targets().resolve({ ...query, execution: s.execution })).execution).toBe(
      s.execution,
    )
    expect(await targets().resolve({ ...query, execution: sibling.execution })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })
})

/** The scene's execution opened, with one associated Tool call committed in its action batch. */
async function withToolCall(s: SqlScene, journal: AgentJournal<string>, name: string) {
  const opened = ok(await journal.open(s.openInput))
  const tool = toolCall(s.access.tenant, name)
  ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`tool-${name}`),
      authority: opened.authority,
      expected: opened.receipt.revision,
      checkpoint: { ...s.checkpoint, batch: tool.batch },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  return { tool, instance: opened.authority.instance }
}

// R2-D273: the target query of the host's Tool result receiver. Red when the plugin stops
// providing the face, answers from the live checkpoint, or lets a route reach the binding of
// another execution (the session core and the plugin both compare it; red when neither does).
describe('agentToolReceptionTargets: the Tool result receiver face', () => {
  it('answers the binding the committed associated Tool call made, also from a new instance', async () => {
    const s = await scene('tool-targets')
    const first = await assembled(s)
    expect(first.plugin.store?.[agentToolReceptionTargetsKey]?.fiber === first.plugin).toBe(true)
    const { tool, instance: original } = await withToolCall(s, first.journal(), 'tool-targets')
    const query = {
      access: s.access,
      consumer: tool.pending.position,
      reference: tool.pending.reference,
      execution: s.execution,
    }
    const target = { execution: s.execution, instance: original, pending: tool.pending }
    expect(ok(await first.toolTargets().resolve(query))).toEqual(target)
    expect(
      ok(await first.toolTargets().forExecution({ access: s.access, execution: s.execution })),
    ).toEqual([target])
    await first.plugin.dispose()
    const second = await assembled(s)
    expect(ok(await second.toolTargets().resolve(query))).toEqual(target)
  })

  it('an unknown call on the right route is no binding (null); no route, another tenant or a route that holds nothing is denied', async () => {
    const s = await scene('tool-route')
    const { journal, toolTargets } = await assembled(s)
    const { tool } = await withToolCall(s, journal(), 'tool-route')
    const query = {
      access: s.access,
      consumer: tool.pending.position,
      reference: tool.pending.reference,
    }
    const unknown = toolCall(s.access.tenant, 'tool-route-unknown').pending.reference
    expect(
      ok(await toolTargets().resolve({ ...query, reference: unknown, execution: s.execution })),
    ).toBeNull()
    expect(await toolTargets().resolve(query)).toHaveProperty('failure.kind', 'denied')
    const nobody = ok(decodeAgentExecutionId('tool-route-nobody'))
    expect(await toolTargets().resolve({ ...query, execution: nobody })).toHaveProperty(
      'failure.kind',
      'denied',
    )
    expect(
      await toolTargets().forExecution({ access: other, execution: s.execution }),
    ).toHaveProperty('failure.kind', 'denied')
  })

  it('a route to another execution of the same session does not resolve the binding of the first', async () => {
    const s = await scene('tool-sibling')
    const { journal, toolTargets } = await assembled(s)
    const { tool } = await withToolCall(s, journal(), 'tool-sibling')
    const sibling = await nextRun(s, 2)
    expect(sibling.execution).not.toBe(s.execution)
    // The sibling is opened, so the access on its route is allowed: only the binding's execution tells.
    ok(await journal().open(sibling.openInput))
    const query = {
      access: s.access,
      consumer: tool.pending.position,
      reference: tool.pending.reference,
    }
    expect(ok(await toolTargets().resolve({ ...query, execution: s.execution }))?.execution).toBe(
      s.execution,
    )
    expect(await toolTargets().resolve({ ...query, execution: sibling.execution })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })
})

describe('sessionAdoptedRequests: the a part of a session, from the same plugin body', () => {
  /** One main-purpose M0 of the scene's execution through `journal`. */
  async function m0(s: SqlScene, journal: AgentJournal<string>, authority: unknown, tag: string) {
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    const scope = { ref: 'scope:adopted-plugin' } as never
    const { adoptedRequest, adoptedContext } = m0Checkpoint({ tenant: s.access.tenant, scope }, tag)
    return ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`m0-${tag}`),
        authority: authority as never,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, adoptedRequest, adoptedContext },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
  }

  it('answers null before the first M0 and the saved request after it, checking history.readModelView on the session each call', async () => {
    const s = await scene('adopted-plugin')
    const { plugin, journal, adopted, wiring } = await assembled(s)
    expect(plugin.store?.[sessionAdoptedRequestsKey]?.fiber === plugin).toBe(true)
    const read = () => adopted().readAdoptedRequest({ access: s.access, session: s.access.session })
    const open = ok(await journal().open(s.openInput))
    expect(await read()).toEqual({ kind: 'value', value: null })
    await m0(s, journal(), open.authority, '1')
    const answer = await read()
    expect(answer).toMatchObject({ kind: 'value', value: { order: '1', execution: s.execution } })
    expect(wiring.decided.at(-1)).toEqual({
      access: s.access,
      operation: 'history.readModelView',
      target: { kind: 'session', session: s.access.session },
    })
  })

  it('a denied access is denied, an undecided one or a throwing check unavailable, and nothing is read', async () => {
    const s = await scene('adopted-plugin-access')
    const { adopted, wiring, journal } = await assembled(s)
    const open = ok(await journal().open(s.openInput))
    await m0(s, journal(), open.authority, '1')
    const read = () => adopted().readAdoptedRequest({ access: s.access, session: s.access.session })
    const reads = wiring.reads
    wiring.decide = () => ({ kind: 'denied' })
    expect(await read()).toEqual({ kind: 'denied' })
    wiring.decide = () => ({ kind: 'unavailable', diagnostic: 'qualification source down' })
    expect(await read()).toEqual({ kind: 'unavailable', diagnostic: 'qualification source down' })
    wiring.decide = () => {
      throw new Error('check threw')
    }
    expect(await read()).toMatchObject({ kind: 'unavailable' })
    expect(wiring.reads).toBe(reads)
    // An unminted tenant is refused before the check; another tenant never reads this session's a.
    wiring.decide = undefined
    const unminted = { ...s.access, tenant: structuredClone(s.access.tenant) }
    expect(
      await adopted().readAdoptedRequest({ access: unminted, session: s.access.session }),
    ).toEqual({ kind: 'denied' })
    expect(
      await adopted().readAdoptedRequest({
        access: { principal: other.principal, tenant: other.tenant },
        session: s.access.session,
      }),
    ).toEqual({ kind: 'value', value: null })
  })

  it('a held reference answers unavailable after the plugin stopped', async () => {
    const s = await scene('adopted-plugin-stop')
    const { plugin, adopted } = await assembled(s)
    const held = adopted()
    await plugin.dispose()
    expect(
      await held.readAdoptedRequest({ access: s.access, session: s.access.session }),
    ).toMatchObject({ kind: 'unavailable' })
  })
})

describe('agentJournalEntries and agentMaterials: the same provider as agentJournal', () => {
  it('serves the three keys from its own fiber, removes the three together when it stops, and a held reference then answers unavailable', async () => {
    const s = await scene('faces-fiber')
    const { ctx, plugin, journal, entries, materials } = await assembled(s)
    // Compared by identity: printing a Cordis fiber reads services it does not inject.
    for (const key of FACES) expect(plugin.store?.[key]?.fiber === plugin, key).toBe(true)
    ok(await journal().open(s.openInput))
    const value = factsMaterial('kept')
    const source = ok(
      await s.view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'kept',
        consumer: CONSUMER,
        value,
      }),
    )
    const held = { entries: entries(), materials: materials() }
    expect(ok(await held.materials.read({ ...s.access, source }))).toEqual(value)
    await plugin.dispose()
    for (const key of FACES) expect(ctx.get(key), key).toBeUndefined()
    const commits = s.commits.length
    const entry = sampleReceivedModelResult(s.access.tenant, 'after-stop')
    expect(
      await held.entries.record({
        ...s.access,
        execution: s.execution,
        operation: operation('after-stop'),
        authority: null,
        entry,
      }),
    ).toMatchObject(unavailableHere)
    // A source of this session that read before the stop: only the stop refuses it now.
    expect(await held.materials.read({ ...s.access, source })).toMatchObject(unavailableHere)
    expect(
      await held.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'after-stop',
        consumer: CONSUMER,
        value: factsMaterial('after-stop'),
      }),
    ).toMatchObject(unavailableHere)
    expect(s.commits.length).toBe(commits)
  })

  it('a delivery the result receiver saved in the session log is one fact to all three faces', async () => {
    const s = await scene('faces-received')
    const { journal, entries, materials } = await assembled(s)
    const draft = await waitingOnModel(s, journal(), 'faces-received')
    const material = factsMaterial('faces-received')
    // The result receiver saves entry, material and saved in one commit of the same session log.
    const saved = ok(
      await s.view.received.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('receive'),
        entry: draft,
        material,
      }),
    )
    if (saved.kind !== 'committed') throw new Error(`received ${saved.kind}`)
    const { entry, receipt } = saved.value

    const loaded = ok(await journal().load({ ...s.access, execution: s.execution }))
    const read = ok(
      await entries().read({ ...s.access, execution: s.execution, after: null, limit: 100 }),
    )
    expect(read.items.map(item => item.entry)).toContainEqual(entry)
    expect(ok(await materials().read({ ...s.access, source: entry.material }))).toEqual(material)
    // The entries face recognizes the saved delivery: the original receipt and no second fact.
    expect(
      ok(
        await entries().record({
          ...s.access,
          execution: s.execution,
          operation: operation('record-again'),
          authority: null,
          entry,
        }),
      ),
    ).toEqual(receipt)
    expect(ok(await journal().load({ ...s.access, execution: s.execution })).revision).toBe(
      loaded.revision,
    )
  })

  it('a record whose reply was lost is decided by the Journal of the same provider: excluded once the storage proves it never ran', async () => {
    const s = await scene('faces-lost')
    const { journal, entries, wiring } = await assembled(s)
    ok(await journal().open(s.openInput))
    const input = {
      ...s.access,
      execution: s.execution,
      operation: operation('lost-record'),
      authority: null,
      entry: sampleReceivedModelResult(s.access.tenant, 'faces-lost'),
    }
    wiring.fault = 'dropped'
    expect(await entries().record(input)).toEqual({
      failure: { kind: 'commit-unknown', operation: input.operation },
    })
    const query = { ...s.access, execution: s.execution, operation: input.operation }
    expect(ok(await journal().query(query))).toMatchObject({ kind: 'excluded' })
  })

  it('records for an execution no Run started as for one of another tenant: the same denied, nothing written', async () => {
    const s = await scene('faces-denied')
    const { journal, entries } = await assembled(s)
    ok(await journal().open(s.openInput))
    const commits = s.commits.length
    const record = (access: typeof s.access, execution: typeof s.execution) =>
      entries().record({
        ...access,
        execution,
        operation: operation('denied-record'),
        authority: null,
        entry: sampleReceivedModelResult(access.tenant, 'faces-denied'),
      })
    const foreign = await record(other, s.execution)
    const never = await record(s.access, ok(decodeAgentExecutionId('run_never/execution')))
    expect(foreign).toEqual({ failure: { kind: 'denied', action: 'record' } })
    expect(never).toEqual(foreign)
    expect(s.commits.length).toBe(commits)
  })

  it('reads a material through the session its source names; another tenant and a foreign source are unavailable', async () => {
    const s = await scene('faces-materials')
    const { journal, materials, wiring } = await assembled(s)
    ok(await journal().open(s.openInput))
    const value = factsMaterial('kept')
    const source = ok(
      await s.view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'kept',
        consumer: CONSUMER,
        value,
      }),
    )
    expect(ok(await materials().read({ ...s.access, source }))).toEqual(value)

    const commits = s.commits.length
    const reads = wiring.reads
    // Another tenant's source is refused before the storage is asked anything.
    expect(await materials().read({ ...other, source })).toMatchObject(unavailableHere)
    expect(wiring.reads).toBe(reads)
    expect(
      await materials().read({ ...s.access, source: evidence('not-a-session-log-material') }),
    ).toMatchObject(unavailableHere)
    expect(s.commits.length).toBe(commits)
  })

  it('a material read is ordered with the writes of the same session: it waits for the write in flight', async () => {
    const s = await scene('faces-ordering')
    const { journal, entries, materials, wiring } = await assembled(s)
    ok(await journal().open(s.openInput))
    const value = factsMaterial('ordered')
    const source = ok(
      await s.view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'ordered',
        consumer: CONSUMER,
        value,
      }),
    )
    let reached!: () => void
    const writing = new Promise<void>(resolve => {
      reached = resolve
    })
    let release!: () => void
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    wiring.hold = { reached, released }
    const write = entries().record({
      ...s.access,
      execution: s.execution,
      operation: operation('ordering-record'),
      authority: null,
      entry: sampleReceivedModelResult(s.access.tenant, 'faces-ordering'),
    })
    await writing

    const read = materials().read({ ...s.access, source })
    const first = await Promise.race([
      read.then(() => 'read'),
      new Promise(resolve => setTimeout(() => resolve('waiting'), 200)),
    ])
    release()

    expect(first).toBe('waiting')
    expect(await write).toHaveProperty('ok')
    expect(ok(await read)).toEqual(value)
  })
})

/**
 * The core suite's fixture through the plugin: each case opens its own scene and its own Cordis
 * root, and the execution through `agentJournal`. The Journal holds the test cancellation
 * installation (R2-D35) unless the case asks for none.
 * Host records, settlement qualifications, legacy candidates and reply admission controls have no
 * seam in the production provider; those cases are uncovered too.
 */
const coreFixtureVia = (via: 'plugin' | 'direct'): AgentJournalCoreFixture<string> => ({
  async open(name, options = {}): Promise<AgentJournalCoreOpened<string>> {
    const s = await scene(`${via === 'plugin' ? 'pj' : 'pd'}-${name}`.slice(0, 48))
    // An absent policy leaves the Journal without an installation; otherwise the test installation
    // is handed in the way the production entry does (R2-D35): the plugin factory, or the option.
    const installation = options.cancellationPolicy === 'absent' ? undefined : testCancellation()
    const { journal: current, wiring } =
      via === 'plugin'
        ? await assembled(
            s,
            {},
            installation === undefined
              ? SessionLogAgentJournalProvider
              : createSessionAgentJournalPlugin({ cancellation: installation }),
          )
        : await direct(s, installation)
    const base = current()
    const opened = ok(await base.open(s.openInput))
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    // A scripted fault belongs to the next call of its method, as in the memory Journal: that call
    // takes it even when it is refused before it commits.
    const faults = new Map<string, Fault>()
    const faulted =
      <A extends unknown[], R>(method: string, call: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        wiring.fault = faults.get(method) ?? null
        faults.delete(method)
        try {
          return await call(...args)
        } finally {
          wiring.fault = null
        }
      }
    const handedOver = new Set<string>()
    const journal: AgentJournal<string> = {
      ...base,
      recordControl: faulted('recordControl', base.recordControl),
      recordHandoff: faulted('recordHandoff', base.recordHandoff),
      commit: faulted('commit', base.commit),
      prepareFinish: faulted('prepareFinish', base.prepareFinish),
      tryFinish: faulted('tryFinish', base.tryFinish),
      commitSettlement: faulted('commitSettlement', base.commitSettlement),
      async submit(input) {
        const answered = await faulted('submit', base.submit)(input)
        if (
          'ok' in answered &&
          input.lineage.kind === 'new-input' &&
          !handedOver.has(input.value.id)
        ) {
          handedOver.add(input.value.id)
          ok(await handed(s, input.value.id, answered.ok.evidence as DurableEvidence))
        }
        return answered
      },
    }
    return {
      journal,
      access: s.access,
      otherAccess: other,
      execution: s.execution,
      receipt: opened.receipt,
      authority: opened.authority,
      checkpoint: s.checkpoint,
      installation: installation?.installation ?? null,
      acceptInput: async label => {
        const value = ordinaryInput(`input-${label}`)
        const accepted = ok(
          await s.port.commit({
            access: s.sessionAccess,
            command: {
              kind: 'accept',
              input: {
                tenant: s.access.tenant,
                session: s.access.session,
                operation: operationId(`accept-${label}`),
                value,
              },
            },
            guards: [guard('evidence-bridge', 'ordinary-intake', value)],
          }),
        )
        return {
          id: ok(decodeInputId(`input-${label}`)),
          // AD-14: the source basis of a submitted input is the receipt of its SE11 (PA-01 item 2).
          source: (accepted as { source: DurableEvidence }).source,
          content: value.message,
          priority: 'ordinary' as const,
        }
      },
      produceResult: async label => {
        const tool = toolCall(s.access.tenant, label)
        const loaded = ok(await base.load({ ...s.access, execution: s.execution }))
        const attachment = loaded.executionAttachment
        if (attachment === null) throw new Error('an active attachment is expected')
        ok(
          await base.commit({
            ...s.access,
            execution: s.execution,
            operation: operation(`pending-${label}`),
            authority: attachment,
            expected: loaded.revision,
            checkpoint: { ...loaded.checkpoint, batch: tool.batch },
            state: { kind: 'advancing' },
            events: [],
            effects: [
              { action: tool.pending.action, pending: tool.pending, authority: attachment },
            ],
            caller: { kind: 'none' },
            replyAdmission: null,
            handoff: null,
            finish: null,
          }),
        )
        return {
          result: tool.placeholder,
          consumption: tool.pending.consumption,
          transfer: {
            kind: 'custody',
            result: tool.placeholder,
            consumption: tool.pending.consumption,
            retained: evidence(`custody-${label}`),
          },
        }
      },
      faultNext: (method, outcome) => {
        faults.set(method, outcome)
      },
      takeover: async label => {
        const before = ok(await s.port.readWork(s.sessionAccess))
        if (before.run.kind !== 'active') throw new Error('active Run expected')
        const claimed = ok(
          await s.port.commit({
            access: s.sessionAccess,
            command: {
              kind: 'claim',
              input: {
                tenant: s.access.tenant,
                session: s.access.session,
                operation: operationId(`claim-${label}`),
                run: before.run.run,
                instance: { owner: 'agent', id: label },
                continuity: evidence(`continuity-${label}`),
              },
            },
            guards: [],
          }),
        )
        return ok(
          await base.attach({
            ...s.access,
            execution: s.execution,
            operation: operation(`attach-${label}`),
            instance: instance(label),
            grant: claimed.receipt.source,
            recovery: evidence(`recovery-${label}`),
            takeover: evidence(`takeover-${label}`),
          }),
        ).authority
      },
    }
  },
})

/** The capabilities a case may name as missing; any other is a fixture fault. */
const UNCOVERABLE =
  /^uncovered: the fixture has no (cancellation policy installation|hostRecord control|qualify control|seedLegacyCandidate control|seedLegacyCandidate and hostRecord controls|replyAdmissions controls)$/u

/**
 * The case the session-log Journal itself does not pass yet. It fails the same way through the
 * plugin and straight from `forSession` (the suite runs both ways below), and it is pinned to the
 * failing assertion: the message names the call and the values are the counters `advances` read.
 * Any other failure of the case is red, and so is a pass.
 */
const PROVIDER_GAPS: readonly Readonly<{
  name: string
  gap: string
  pinned(error: unknown): boolean
}>[] = [
  {
    name: 'Q3 and Q13: recordResult advances one revision for a new responsibility fact',
    gap: 'a custody transfer of a result is refused: Session holds no producer binding of the consumption (session-contract decide-results: no matching producer binding)',
    pinned: error =>
      error instanceof Error &&
      error.message.startsWith('recordResult') &&
      JSON.stringify((error as { actual?: unknown }).actual) === '[0,0]' &&
      JSON.stringify((error as { expected?: unknown }).expected) === '[1,0]',
  },
  {
    name: 'judge-cancellation: a result without custody is a blocked judgment',
    gap: 'the custody of a result is refused: Session holds no producer binding of the consumption (session-contract decide-results: no matching producer binding)',
    pinned: error =>
      error instanceof Error &&
      error.message.startsWith('the custody should succeed') &&
      error.message.includes('no matching producer binding'),
  },
]

for (const via of ['plugin', 'direct'] as const) {
  const fixture = coreFixtureVia(via)
  const how =
    via === 'plugin' ? 'through the plugin' : 'straight from forSession, without the plugin'
  describe(`the Agent contract core Journal suite ${how} (Session log over node:sqlite)`, () => {
    for (const entry of agentJournalCoreConformance(fixture)) {
      if ('uncovered' in entry) {
        it.skip(`${entry.name} (${entry.uncovered})`, entry.run)
        continue
      }
      const known = PROVIDER_GAPS.find(item => entry.name.startsWith(item.name))
      it(
        known === undefined ? entry.name : `${entry.name} [provider gap: ${known.gap}]`,
        async context => {
          try {
            await entry.run()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message.startsWith('uncovered:')) {
              expect(message).toMatch(UNCOVERABLE)
              context.skip(message)
            }
            if (known === undefined) throw error
            expect(known.pinned(error), message).toBe(true)
            return
          }
          if (known !== undefined)
            expect.fail(
              `the provider gap "${known.gap}" no longer shows: remove it from PROVIDER_GAPS`,
            )
        },
      )
    }
  })
}

describe('routing on the real sqlite-provider', () => {
  it(
    'opens the executions of two sessions on their own logs and denies another tenant alike an unknown execution',
    { tags: ['slow'] },
    async () => {
      // Why slow: real Workers and real files.
      const s = await scene('route-real', { storage: 'real' })
      const b = await secondSession(s, 'route-real-b')
      const { journal } = await assembled(s)
      ok(await journal().open(s.openInput))
      ok(await journal().open(b.openInput))
      expect(ok(await journal().load({ ...s.access, execution: s.execution })).revision).toBe('1')
      expect(ok(await journal().load({ ...b.access, execution: b.execution })).revision).toBe('1')
      const commits = s.commits.length
      const foreign = await journal().load({ ...other, execution: s.execution })
      const never = await journal().load({
        ...s.access,
        execution: ok(decodeAgentExecutionId('run_never/execution')),
      })
      expect(foreign).toEqual({ failure: { kind: 'denied', action: 'load' } })
      expect(never).toEqual(foreign)
      expect(s.commits.length).toBe(commits)
      // A new instance on the same files finds the same session.
      const second = await assembled(s)
      expect(
        ok(await second.journal().load({ ...b.access, execution: b.execution })).revision,
      ).toBe('1')
    },
  )
})

/** The routed Journal made directly, over the scene's storage, so an option can be handed to it. */
async function routedDirect(
  s: SqlScene,
  extra: Partial<ExecutionRoutedJournalOptions<string>> = {},
) {
  const services = servicesOf(s, await otherDomainOf(s))
  const routed = createExecutionRoutedJournal<string>({
    storage: services.storage,
    tenantDomainLookup: services.lookup,
    sessionAccessCheck: { check: services.check },
    combination: s.combination,
    ...extra,
  })
  disposers.push(() => Promise.resolve(routed.close()))
  return { routed, wiring: services.wiring }
}

/**
 * The cancellation route up to the judgment, through `journal`: the cancel control and its intent,
 * the established candidate, then the judgment. Answers the first failure, or the judgment.
 */
async function cancelThrough(journal: AgentJournal<string>, s: SqlScene) {
  const control = operation('cancel-control')
  ok(
    await journal.control({
      ...s.access,
      execution: s.execution,
      operation: control,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  ok(
    await journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('cancel-intent'),
      target: control,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
  const common = async (name: string) => {
    const snapshot = ok(await journal.load({ ...s.access, execution: s.execution }))
    const record = snapshot.controls.find(item => item.operation === control)
    if (record === undefined) throw new Error('the control should be saved')
    return {
      snapshot,
      common: {
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authorization: {
          kind: 'cancel' as const,
          control,
          source: record.stages.accepted.source,
        },
        expected: snapshot.revision,
        installation: testCancellationPolicyInstallation.record,
      },
    }
  }
  const first = await common('cancel-establish')
  const established = await journal.commitSettlement({
    ...first.common,
    kind: 'establish-cancellation',
    predecessor: null,
  })
  if ('failure' in established) return established
  const second = await common('cancel-judge')
  const route = second.snapshot.settlement.route
  if (route === null) throw new Error('a route is expected')
  return journal.commitSettlement({
    ...second.common,
    kind: 'judge-cancellation',
    candidate: route.candidate,
    route: route.record,
  })
}

describe('R2-D35: the cancellation installation handed to the session-log Journal', () => {
  it('R2-D35 hands the installation of its options to the Journal of the session: the policy judges once', async () => {
    const s = await scene('d35-hand')
    let judged = 0
    const policy = createTestCancellationPolicy()
    const { routed } = await routedDirect(s, {
      cancellation: {
        installation: testCancellationPolicyInstallation,
        policy: {
          ...policy,
          judge: input => {
            judged += 1
            return policy.judge(input)
          },
        },
      },
    })
    const opened = ok(await routed.journal.open(s.openInput))
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    expect(ok(await cancelThrough(routed.journal, s))).toMatchObject({
      judgment: { decision: { kind: 'allowed' } },
    })
    expect(judged).toBe(1)
  })

  it('R2-D35 without an installation in its options the cancellation variants answer unavailable, as before', async () => {
    const s = await scene('d35-none')
    const { routed } = await routedDirect(s)
    ok(await routed.journal.open(s.openInput))
    expect(await cancelThrough(routed.journal, s)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('R2-D35: the plugin factory carries the installation the entry hands in', () => {
  it('R2-D35 a plugin made with an installation loads on real Cordis, hands it to the session Journal: the policy judges once, and stops with the three keys', async () => {
    const s = await scene('d35-plugin')
    let judged = 0
    const policy = createTestCancellationPolicy()
    const Plugin = createSessionAgentJournalPlugin({
      cancellation: {
        installation: testCancellationPolicyInstallation,
        policy: {
          ...policy,
          judge: input => {
            judged += 1
            return policy.judge(input)
          },
        },
      },
    })
    const { ctx, plugin, journal } = await assembled(s, {}, Plugin)
    expect(plugin.state).toBe(ACTIVE)
    const opened = ok(await journal().open(s.openInput))
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    expect(ok(await cancelThrough(journal(), s))).toMatchObject({
      judgment: { decision: { kind: 'allowed' } },
    })
    expect(judged).toBe(1)
    await plugin.dispose()
    for (const key of FACES) expect(ctx.get(key), key).toBeUndefined()
  })

  for (const [label, input] of [
    ['without an input', undefined],
    ['with an input that holds no installation', {}],
  ] as const)
    it(`R2-D35 a plugin made ${label} answers unavailable for the cancellation variants`, async () => {
      const s = await scene(`d35-plugin-none-${input === undefined ? 'a' : 'b'}`)
      const { journal } = await assembled(s, {}, createSessionAgentJournalPlugin(input))
      ok(await journal().open(s.openInput))
      expect(await cancelThrough(journal(), s)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    })
})

describe('K-9: a material to preserve names an execution, and goes to its session', () => {
  it('K-9 preserve with an execution is saved in the session of that execution and read back from its source', async () => {
    const s = await scene('k9-save')
    const b = await secondSession(s, 'k9-save-b')
    const { journal, materials } = await assembled(s)
    ok(await journal().open(s.openInput))
    ok(await journal().open(b.openInput))
    const value = factsMaterial('kept-by-execution')
    const source = ok(
      await materials().preserve({
        ...b.access,
        execution: b.execution,
        identity: 'kept',
        consumer: CONSUMER,
        value,
      }),
    )
    // The source names the session of the execution, not the scene's other session.
    expect(materialSessionOf(source)).toEqual({
      tenant: textOf(b.access.tenant),
      session: b.access.session,
    })
    expect(ok(await materials().read({ ...b.access, source }))).toEqual(value)
  })

  it('K-9 an execution of another tenant and one no Run started are denied and nothing is written', async () => {
    const s = await scene('k9-denied')
    const { journal, materials } = await assembled(s)
    ok(await journal().open(s.openInput))
    const commits = s.commits.length
    const value = factsMaterial('refused')
    const unknown = ok(decodeAgentExecutionId('run_never/execution'))
    const foreign = await materials().preserve({
      ...other,
      execution: s.execution,
      identity: 'foreign',
      consumer: CONSUMER,
      value,
    })
    const never = await materials().preserve({
      ...s.access,
      execution: unknown,
      identity: 'never',
      consumer: CONSUMER,
      value,
    })
    expect(foreign).toEqual({ failure: { kind: 'denied', action: 'preserve' } })
    expect(never).toEqual(foreign)
    expect(s.commits.length).toBe(commits)
  })

  it('K-9 an execution index that cannot be read is unavailable, not denied, and nothing is written', async () => {
    const s = await scene('k9-index')
    const { journal, materials, wiring } = await assembled(s)
    ok(await journal().open(s.openInput))
    const commits = s.commits.length
    wiring.failIndex = true
    // A route the plugin has not cached yet: another tenant's, which the lookup knows.
    const answer = await materials().preserve({
      ...other,
      execution: s.execution,
      identity: 'index',
      consumer: CONSUMER,
      value: factsMaterial('index'),
    })
    expect(answer).toMatchObject(unavailableHere)
    expect(s.commits.length).toBe(commits)
  })

  it('K-9 preserve with an execution after the plugin stopped is unavailable and writes nothing', async () => {
    const s = await scene('k9-stopped')
    const { journal, materials, plugin } = await assembled(s)
    ok(await journal().open(s.openInput))
    const held = materials()
    await plugin.dispose()
    const commits = s.commits.length
    expect(
      await held.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'stopped',
        consumer: CONSUMER,
        value: factsMaterial('stopped'),
      }),
    ).toMatchObject(unavailableHere)
    expect(s.commits.length).toBe(commits)
  })
})

describe('AD-02 trigger: the plugin names each successful write of the Journal', () => {
  const PUBLISHED = 'session-adapters/agent-published'
  type Published = [tenant: unknown, session: unknown, execution: unknown]

  /** Lets the not-awaited dispatch of an event reach its listeners. */
  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 10))

  async function listening(name: string) {
    const s = await scene(name)
    const assembly = await assembled(s)
    const seen: Published[] = []
    assembly.ctx.on(PUBLISHED, (...args: Published) => {
      seen.push(args)
    })
    return { s, seen, ...assembly }
  }

  it('AD-02 trigger: one successful write is followed by exactly one event naming tenant, session and execution', async () => {
    const { s, seen, journal } = await listening('ad02-one')
    ok(await journal().open(s.openInput))
    await flush()
    expect(seen).toEqual([[s.access.tenant, s.access.session, s.execution]])
  })

  it('AD-02 trigger: an entries write is one event too, and a read is none', async () => {
    const { s, seen, journal, entries } = await listening('ad02-entries')
    ok(await journal().open(s.openInput))
    await flush()
    seen.length = 0
    const loaded = ok(await journal().load({ ...s.access, execution: s.execution }))
    ok(
      await journal().inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
    ok(await journal().output.read({ ...s.access, execution: s.execution, after: null, limit: 10 }))
    await flush()
    expect(seen).toEqual([])
    ok(
      await entries().record({
        ...s.access,
        execution: s.execution,
        operation: operation('ad02-record'),
        authority: null,
        entry: sampleReceivedModelResult(s.access.tenant, 'ad02-entries'),
      }),
    )
    await flush()
    expect(seen).toEqual([[s.access.tenant, s.access.session, s.execution]])
  })

  it('AD-02 trigger: a write that fails and a call that was never routed send no event', async () => {
    const { s, seen, journal } = await listening('ad02-fail')
    const opened = ok(await journal().open(s.openInput))
    await flush()
    seen.length = 0
    const stale = await journal().commit({
      ...s.access,
      execution: s.execution,
      operation: operation('ad02-stale'),
      authority: opened.authority,
      expected: '99' as typeof opened.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    })
    expect(stale).toHaveProperty('failure')
    const never = await journal().open({
      ...s.openInput,
      execution: ok(decodeAgentExecutionId('run_never/execution')),
    })
    expect(never).toEqual({ failure: { kind: 'denied', action: 'open' } })
    await flush()
    expect(seen).toEqual([])
  })

  it('AD-02 trigger: a write through a reference held after the plugin stopped sends no event', async () => {
    const { s, seen, journal, plugin } = await listening('ad02-stopped')
    const held = journal()
    await plugin.dispose()
    expect(await held.open(s.openInput)).toMatchObject(unavailableHere)
    await flush()
    expect(seen).toEqual([])
  })

  it('AD-02 trigger: a write in flight when the plugin stops sends no event', async () => {
    const { s, seen, journal, plugin, wiring } = await listening('ad02-inflight')
    let reached!: () => void
    const writing = new Promise<void>(resolve => {
      reached = resolve
    })
    let release!: () => void
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    wiring.hold = { reached, released }
    const write = journal().open(s.openInput)
    await writing
    await plugin.dispose()
    release()
    await write
    await flush()
    expect(seen).toEqual([])
  })

  it('AD-02 trigger: a listener that throws does not change the answer of the write', async () => {
    const s = await scene('ad02-throws')
    const { ctx, journal } = await assembled(s)
    ctx.on(PUBLISHED, () => {
      throw new Error('listener fault')
    })
    expect(ok(await journal().open(s.openInput)).receipt.execution).toBe(s.execution)
    await flush()
  })

  it('AD-02 trigger: a callback of the options that throws does not change the answer either', async () => {
    const s = await scene('ad02-callback')
    const { routed } = await routedDirect(s, {
      published: () => {
        throw new Error('callback fault')
      },
    })
    expect(ok(await routed.journal.open(s.openInput)).receipt.execution).toBe(s.execution)
  })
})
