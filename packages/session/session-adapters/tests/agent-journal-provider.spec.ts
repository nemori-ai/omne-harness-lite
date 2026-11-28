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
import { fail, succeed } from '@omne-harness/operation-result'
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
import {
  type DomainRef,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createSessionLogJournal, materialSessionOf } from '../src/cordis/agent-journal.ts'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import {
  createExecutionRoutedJournal,
  createSessionAgentJournalPlugin,
  SessionLogAgentJournalProvider,
  type ExecutionRoutedJournalOptions,
} from '../src/cordis/agent-journal-provider.ts'
import { checkpoint, instance, ok, openInput, operation } from './fixtures/common-journal.ts'
import {
  cordisScene,
  handed,
  nextRun,
  sqlScene,
  type SqlScene,
  type SqlSceneOptions,
} from './fixtures/sql-scene.ts'
import { invocation, m0Checkpoint } from './fixtures/adopted-request.ts'
import { endWithFailure, noReplyWithFault, refusedByModel } from './fixtures/finish.ts'
import { MODEL_CALL } from './fixtures/main-reply.ts'
import { toolCall } from './fixtures/tool-call.ts'

const PENDING = 0
const ACTIVE = 2
const FAILED = 3

const FACES = [agentJournalKey, agentJournalEntriesKey, agentMaterialsKey] as const

function provides(fiber: Context['fiber'], key: string): boolean {
  return [...fiber.provisions].some(provision => provision.name === key)
}

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

type Fault = 'applied' | 'dropped' | 'pending'

type Wiring = {
  failIndex: boolean
  indexReads: string[]
  reads: number
  fault: Fault | null
  hold: Readonly<{ reached: () => void; released: Promise<void> }> | null
  decide?: ((request: SessionAccessRequest<unknown>) => SessionAccessDecision) | undefined
  decided: SessionAccessRequest<unknown>[]
}

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
  const undecided = new Set<string>()
  const wrapped: SqlStorage = {
    database: storage.database,
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
    readonly database = storage.database
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

type TestCancellation = Readonly<{
  installation: typeof testCancellationPolicyInstallation
  policy: ReturnType<typeof createTestCancellationPolicy>
}>
const testCancellation = (): TestCancellation => ({
  installation: testCancellationPolicyInstallation,
  policy: createTestCancellationPolicy(),
})

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
  const admitted = ok(await s.port.readInput({ ...access, input: snapshot.run.initial[0] }))
  const initial: AcceptedInput = {
    id: ok(decodeInputId(admitted.input)),
    content: admitted.message,
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
      const wrapped = ctx.plugin(SessionLogAgentJournalProvider, config as never)
      const fiber = Object.getPrototypeOf(wrapped) as Awaited<typeof wrapped>
      disposers.push(() => fiber.dispose())
      await fiber.await().catch(() => undefined)
      expect(fiber.state, JSON.stringify(config)).toBe(FAILED)
      expect(ctx.get(agentJournalKey)).toBeUndefined()
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
      const foreign = await call(s.execution, other)
      const never = await call(unknown, s.access)
      const expected = { failure: { kind: 'denied', action } }
      expect(foreign, action).toEqual(action === 'events' ? [expected] : expected)
      expect(never, action).toEqual(foreign)
    }
    expect(s.commits.length).toBe(commits)
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

const unavailableHere = { failure: { kind: 'unavailable', owner: 'session-log-journal' } }
const CONSUMER = { owner: 'suite', work: 'work', position: 'at', purpose: 'action' }

function factsMaterial(name: string): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
    value: { kind: 'string', value: name },
  }
}

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

describe('agentReceivedCommits and agentModelReceptionTargets: the result receiver faces', () => {
  it('commits a received delivery routed by its execution, as one fact the Journal reads', async () => {
    const s = await scene('recv-commit')
    const { plugin, journal, entries, received } = await assembled(s)
    for (const key of [agentReceivedCommitsKey, agentModelReceptionTargetsKey])
      expect(provides(plugin, key), key).toBe(true)
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
    expect(ok(await received().commit(input))).toEqual(saved)
    expect(ok(await received().query(input))).toEqual(saved)
    expect(ok(await journal().load({ ...s.access, execution: s.execution })).revision).toBe(
      loaded.revision,
    )
    const unknown = ok(decodeAgentExecutionId('recv-nobody'))
    expect(await received().commit({ ...input, execution: unknown })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })

  it('agentReceivedRecords answers the committed record, also from a new instance on the same storage', async () => {
    const s = await scene('recv-records')
    const first = await assembled(s)
    expect(provides(first.plugin, agentReceivedRecordsKey)).toBe(true)
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
    expect(ok(await targets().resolve({ ...query, execution: s.execution }))).toMatchObject({
      execution: s.execution,
    })
    expect(await targets().resolve({ ...query, execution: sibling.execution })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })
})

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

describe('agentToolReceptionTargets: the Tool result receiver face', () => {
  it('answers the binding the committed associated Tool call made, also from a new instance', async () => {
    const s = await scene('tool-targets', { storage: 'real' })
    const first = await assembled(s)
    expect(provides(first.plugin, agentToolReceptionTargetsKey)).toBe(true)
    const { tool, instance: original } = await withToolCall(s, first.journal(), 'tool-targets')
    const query = {
      access: s.access,
      consumer: tool.pending.position,
      reference: tool.pending.reference,
      execution: s.execution,
    }
    const target = {
      execution: s.execution,
      instance: original,
      definition: s.checkpoint.definition,
      pending: tool.pending,
    }
    expect(ok(await first.toolTargets().resolve(query))).toEqual(target)
    expect(
      ok(await first.toolTargets().forExecution({ access: s.access, execution: s.execution })),
    ).toEqual([target])
    const current = ok(await first.journal().load({ ...s.access, execution: s.execution }))
    if (current.executionAttachment === null)
      throw new Error('the test execution must still be attached')
    ok(
      await first.journal().commit({
        ...s.access,
        execution: s.execution,
        operation: operation('change-after-original-tool-binding'),
        authority: current.executionAttachment,
        expected: current.revision,
        checkpoint: {
          ...current.checkpoint,
          definition: { ...current.checkpoint.definition, revision: 'later' },
          batch: null,
          calls: [],
        },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    expect(ok(await first.toolTargets().resolve(query))).toEqual(target)
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
    ok(await journal().open(sibling.openInput))
    const query = {
      access: s.access,
      consumer: tool.pending.position,
      reference: tool.pending.reference,
    }
    expect(ok(await toolTargets().resolve({ ...query, execution: s.execution }))).toMatchObject({
      execution: s.execution,
    })
    expect(await toolTargets().resolve({ ...query, execution: sibling.execution })).toHaveProperty(
      'failure.kind',
      'denied',
    )
  })
})

describe('sessionAdoptedRequests: the a part of a session, from the same plugin body', () => {
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

  it('answers null before the first M0 and the saved request after it, checking history.readAdoptedRequest on the session each call', async () => {
    const s = await scene('adopted-plugin')
    const { plugin, journal, adopted, wiring } = await assembled(s)
    expect(provides(plugin, sessionAdoptedRequestsKey)).toBe(true)
    const read = () => adopted().readAdoptedRequest({ access: s.access, session: s.access.session })
    const open = ok(await journal().open(s.openInput))
    expect(await read()).toEqual({ kind: 'value', value: null })
    await m0(s, journal(), open.authority, '1')
    const answer = await read()
    // The order is the publication that adopted the request: the M0, the last one.
    const [[pub]] = s.controls!.select(
      `SELECT pub FROM er_fact WHERE session = '${s.access.session}' AND kind = 'request.adopted'`,
    ).rows as [[bigint]]
    expect(answer).toMatchObject({
      kind: 'value',
      value: { order: String(pub), execution: s.execution },
    })
    expect(wiring.decided.at(-1)).toEqual({
      access: s.access,
      operation: 'history.readAdoptedRequest',
      target: { kind: 'session', session: s.access.session },
    })
  })

  it('answers the request adopted for the call a reference names, the latest without one, and null for a call it has none of', async () => {
    const s = await scene('adopted-plugin-reference')
    const { adopted, journal, wiring } = await assembled(s)
    const open = ok(await journal().open(s.openInput))
    await m0(s, journal(), open.authority, '1')
    await m0(s, journal(), open.authority, '2')
    const read = (reference?: string) =>
      adopted().readAdoptedRequest({
        access: s.access,
        session: s.access.session,
        ...(reference === undefined ? {} : { reference }),
      })
    const named = (tag: string) => invocation(s.access.tenant, tag)
    expect(await read(named('1'))).toMatchObject({
      kind: 'value',
      value: { reference: named('1') },
    })
    expect(await read(named('2'))).toMatchObject({
      kind: 'value',
      value: { reference: named('2') },
    })
    expect(await read()).toMatchObject({ kind: 'value', value: { reference: named('2') } })
    expect(await read(named('3'))).toEqual({ kind: 'value', value: null })
    expect(wiring.decided.at(-1)).toMatchObject({ operation: 'history.readAdoptedRequest' })
    const [first, second] = [await read(named('1')), await read(named('2'))]
    if (first.kind !== 'value' || second.kind !== 'value') throw new Error('expected two values')
    expect(BigInt(first.value!.order) < BigInt(second.value!.order)).toBe(true)
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
    expect(
      await held.readRequestChoices({
        access: s.access,
        session: s.access.session,
        reference: invocation(s.access.tenant, '1'),
      }),
    ).toMatchObject({ kind: 'unavailable' })
  })

  it('the choices of a call check history.readAdoptedRequest on the session: denied, undecided and unminted answer as the adopted request does', async () => {
    const s = await scene('adopted-plugin-choices')
    const { adopted, wiring, journal } = await assembled(s)
    const open = ok(await journal().open(s.openInput))
    await m0(s, journal(), open.authority, '1')
    const reference = invocation(s.access.tenant, '1')
    const read = (access = s.access) =>
      adopted().readRequestChoices({ access, session: s.access.session, reference })
    expect(await read()).toEqual({ kind: 'value', value: [] })
    expect(wiring.decided.at(-1)).toEqual({
      access: s.access,
      operation: 'history.readAdoptedRequest',
      target: { kind: 'session', session: s.access.session },
    })
    const reads = wiring.reads
    wiring.decide = () => ({ kind: 'denied' })
    expect(await read()).toEqual({ kind: 'denied' })
    wiring.decide = () => ({ kind: 'unavailable', diagnostic: 'qualification source down' })
    expect(await read()).toEqual({ kind: 'unavailable', diagnostic: 'qualification source down' })
    expect(wiring.reads).toBe(reads)
    wiring.decide = undefined
    expect(await read({ ...s.access, tenant: structuredClone(s.access.tenant) })).toEqual({
      kind: 'denied',
    })
  })
})

describe('agentJournalEntries and agentMaterials: the same provider as agentJournal', () => {
  it('serves the three keys from its own fiber, removes the three together when it stops, and a held reference then answers unavailable', async () => {
    const s = await scene('faces-fiber')
    const { ctx, plugin, journal, entries, materials } = await assembled(s)
    for (const key of FACES) expect(provides(plugin, key), key).toBe(true)
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

describe('readFinish: the finish candidate of a settling or ended execution', () => {
  it('through the plugin, a model-refused end: null before any candidate, the current intent while settling, the final intent with the capacity refusal after the end', async () => {
    const s = await scene('finish-refused')
    const { journal } = await assembled(s)
    const seen = await endWithFailure(s, journal(), refusedByModel())

    expect(seen.beforeCandidate).toEqual({ ok: null })
    expect(seen.whileSettling).toEqual({ ok: seen.settlingIntent })
    expect(seen.ended.state.kind).toBe('ended')
    expect(seen.afterEnd).toEqual({ ok: seen.finalIntent })
    const final = ok(seen.afterEnd)
    expect(final?.conclusion).toEqual({ kind: 'fail', cause: evidence('finish-cause') })
    expect(final?.failure).toMatchObject({
      kind: 'model-refused',
      call: MODEL_CALL,
      failure: { kind: 'denied' },
    })
    expect(final?.obligations).not.toBeNull()
  })

  it('straight from forSession, a no-reply end carries the fault of the settlement: cause and upstreamStatus as written', async () => {
    const s = await scene('finish-no-reply')
    const { journal } = await direct(s)
    const seen = await endWithFailure(s, journal(), noReplyWithFault())

    expect(seen.afterEnd).toEqual({ ok: seen.finalIntent })
    const final = ok(seen.afterEnd)
    expect(final?.failure).toMatchObject({
      kind: 'no-reply',
      call: MODEL_CALL,
      fault: { cause: 'upstream-unavailable', upstreamStatus: '504' },
    })
  })

  it('answers the six members of the FinishIntent and nothing else: no checkpoint, no message body', async () => {
    const s = await scene('finish-closed')
    const { journal } = await assembled(s)
    const seen = await endWithFailure(s, journal(), noReplyWithFault())
    const final = ok(seen.afterEnd)
    if (final === null) throw new Error('a final intent is expected')

    expect(Object.keys(final).sort()).toEqual(
      [
        'beforeTerminal',
        'candidate',
        'conclusion',
        'failure',
        'inputWatermark',
        'obligations',
      ].sort(),
    )
    const text = JSON.stringify(final)
    expect(text).not.toContain(JSON.stringify(s.initial.content))
    expect(text).not.toContain('"checkpoint"')
    expect(text).not.toContain('"permissions"')
  })

  it('an execution of another tenant and one no Run started get the same denied, and nothing is written', async () => {
    const s = await scene('finish-denied')
    const { journal, wiring } = await assembled(s)
    const read = journal().readFinish
    expect(read).toBeDefined()
    if (read === undefined) return
    await endWithFailure(s, journal(), refusedByModel())
    const commits = s.commits.length
    const unknown = ok(decodeAgentExecutionId('run_never/execution'))

    const foreign = await read({ ...other, execution: s.execution })
    const never = await read({ ...s.access, execution: unknown })
    expect(foreign).toEqual({ failure: { kind: 'denied', action: 'readFinish' } })
    expect(never).toEqual(foreign)
    expect(s.commits.length).toBe(commits)
    expect(wiring.indexReads.filter(tenant => tenant === textOf(other.tenant))).toHaveLength(1)
  })
})

const coreFixtureVia = (via: 'plugin' | 'direct'): AgentJournalCoreFixture<string> => ({
  async open(name, options = {}): Promise<AgentJournalCoreOpened<string>> {
    const s = await scene(`${via === 'plugin' ? 'pj' : 'pd'}-${name}`.slice(0, 48))
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
        const interpreter = await cordisScene(s, {
          acknowledge: () => async () => fail({ kind: 'unsupported' }),
        })
        disposers.push(() => interpreter.dispose())
        const interpretation = createSessionJournalInterpretationPlugin<string>({
          coordinator: async () => succeed(s.access.principal),
        })
        await interpreter.mount(interpretation.plugin)
        const interpreted = ok(
          await interpretation.interpret({
            tenant: s.access.tenant,
            session: s.access.session,
            execution: s.execution,
          }),
        )
        expect(interpreted.waiting).toBe(0)
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
                expected: before.run.revision,
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

const UNCOVERABLE =
  /^uncovered: the fixture has no (cancellation policy installation|hostRecord control|qualify control|seedLegacyCandidate control|seedLegacyCandidate and hostRecord controls|replyAdmissions controls)$/u

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
      const second = await assembled(s)
      expect(
        ok(await second.journal().load({ ...b.access, execution: b.execution })).revision,
      ).toBe('1')
    },
  )
})

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

describe('the cancellation installation handed to the session-log Journal', () => {
  it('hands the installation of its options to the Journal of the session: the policy judges once', async () => {
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

  it('without an installation in its options the cancellation variants answer unavailable, as before', async () => {
    const s = await scene('d35-none')
    const { routed } = await routedDirect(s)
    ok(await routed.journal.open(s.openInput))
    expect(await cancelThrough(routed.journal, s)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('the plugin factory carries the installation the entry hands in', () => {
  it('a plugin made with an installation loads on real Cordis, hands it to the session Journal: the policy judges once, and stops with the three keys', async () => {
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
    it(`a plugin made ${label} answers unavailable for the cancellation variants`, async () => {
      const s = await scene(`d35-plugin-none-${input === undefined ? 'a' : 'b'}`)
      const { journal } = await assembled(s, {}, createSessionAgentJournalPlugin(input))
      ok(await journal().open(s.openInput))
      expect(await cancelThrough(journal(), s)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    })
})

describe('a material to preserve names an execution, and goes to its session', () => {
  it('preserve with an execution is saved in the session of that execution and read back from its source', async () => {
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
    expect(materialSessionOf(source)).toEqual({
      tenant: textOf(b.access.tenant),
      session: b.access.session,
    })
    expect(ok(await materials().read({ ...b.access, source }))).toEqual(value)
  })

  it('a preserve carries no operation of its own: one riding along on the request does not name the write', async () => {
    const s = await scene('k9-named')
    const { journal, materials } = await assembled(s)
    ok(await journal().open(s.openInput))
    const value = factsMaterial('stage')
    const request = {
      ...s.access,
      execution: s.execution,
      identity: 'stage',
      consumer: CONSUMER,
      value,
      operation: s.openInput.operation,
    }
    const source = ok(await materials().preserve(request))
    expect(ok(await materials().read({ ...s.access, source }))).toEqual(value)
  })

  it('an execution of another tenant and one no Run started are denied and nothing is written', async () => {
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

  it('an execution index that cannot be read is unavailable, not denied, and nothing is written', async () => {
    const s = await scene('k9-index')
    const { journal, materials, wiring } = await assembled(s)
    ok(await journal().open(s.openInput))
    const commits = s.commits.length
    wiring.failIndex = true
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

  it('preserve with an execution after the plugin stopped is unavailable and writes nothing', async () => {
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

describe('trigger: the plugin names each successful write of the Journal', () => {
  const PUBLISHED = 'session-adapters/agent-published'
  type Published = [tenant: unknown, session: unknown, execution: unknown]

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

  it('trigger: one successful write is followed by exactly one event naming tenant, session and execution', async () => {
    const { s, seen, journal } = await listening('ad02-one')
    ok(await journal().open(s.openInput))
    await flush()
    expect(seen).toEqual([[s.access.tenant, s.access.session, s.execution]])
  })

  it('trigger: an entries write is one event too, and a read is none', async () => {
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

  it('trigger: a write that fails and a call that was never routed send no event', async () => {
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

  it('trigger: a write through a reference held after the plugin stopped sends no event', async () => {
    const { s, seen, journal, plugin } = await listening('ad02-stopped')
    const held = journal()
    await plugin.dispose()
    expect(await held.open(s.openInput)).toMatchObject(unavailableHere)
    await flush()
    expect(seen).toEqual([])
  })

  it('trigger: a write in flight when the plugin stops sends no event', async () => {
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

  it('trigger: a listener that throws does not change the answer of the write', async () => {
    const s = await scene('ad02-throws')
    const { ctx, journal } = await assembled(s)
    ctx.on(PUBLISHED, () => {
      throw new Error('listener fault')
    })
    expect(ok(await journal().open(s.openInput)).receipt.execution).toBe(s.execution)
    await flush()
  })

  it('trigger: a callback of the options that throws does not change the answer either', async () => {
    const s = await scene('ad02-callback')
    const { routed } = await routedDirect(s, {
      published: () => {
        throw new Error('callback fault')
      },
    })
    expect(ok(await routed.journal.open(s.openInput)).receipt.execution).toBe(s.execution)
  })
})
