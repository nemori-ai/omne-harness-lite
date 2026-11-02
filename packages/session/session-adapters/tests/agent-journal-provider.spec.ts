// The `agentJournal` plugin of the session-log Journal on real Cordis 4.0.4. What is checked: it
// provides the key only with storage, the trusted tenant domain lookup and the Session access check
// present, and removes it on stop; a reference held from before answers unavailable. A call is
// routed by its tenant and execution to the session whose Run started that execution, so two
// sessions with an execution each do not mix; the route is cached in-process and a new instance
// rebuilds it from storage. An execution no Run started and an execution of another tenant get the
// same `denied` and nothing is written; an unreadable index is `unavailable`, never `denied`. The
// Agent contract's core Journal suite passes through the plugin over the Session log in SQL (the
// node:sqlite double of the published modules), and routing holds on the real sqlite-provider.
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  decodeAgentExecutionId,
  decodeInputId,
  type AcceptedInput,
  type AgentJournal,
  type DurableEvidence,
} from '@omne-harness/agent-contract'
import {
  agentJournalCoreConformance,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
} from '@omne-harness/agent-contract/testing'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
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
import { SessionAccessCheckService } from '@omne-harness/session-cordis-contract/cordis'
import type { DomainRef, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { SessionLogAgentJournalProvider } from '../src/cordis/agent-journal-provider.ts'
import { checkpoint, instance, ok, openInput, operation } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene, type SqlSceneOptions } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

// `FiberState` is a const enum of Cordis, so its members are not values to import: in Cordis 4.0.4
// 0 is PENDING, 2 is ACTIVE and 3 is FAILED.
const PENDING = 0
const ACTIVE = 2
const FAILED = 3

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
  /** The fault of the next storage commit, if any; the commit takes it. */
  fault: Fault | null
}

/**
 * Cordis services over the scene's storage: `storage` (counting and optionally failing the index
 * reads), a trusted lookup that knows the scene's tenant and the other tenant, and a Session access
 * check that allows everything.
 */
function servicesOf(s: SqlScene, otherDomain: DomainRef) {
  const wiring: Wiring = { failIndex: false, indexReads: [], fault: null }
  const storage: SqlStorage = s.storage
  // The operations whose commit never ran and whose outcome stays undecided (`pending`).
  const undecided = new Set<string>()
  const wrapped: SqlStorage = {
    registerCombination: input => storage.registerCombination(input),
    commit: async (input, options) => {
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
  const check = (request: SessionAccessRequest<unknown>): Promise<SessionAccessDecision> =>
    Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) })
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
async function assembled(s: SqlScene, config: Readonly<{ routeCacheEntries?: number }> = {}) {
  const services = servicesOf(s, await otherDomainOf(s))
  const ctx = new Context()
  await mount(ctx, services.Storage)
  await mount(ctx, services.Lookup)
  await mount(ctx, services.Access)
  const plugin = await mount(ctx, SessionLogAgentJournalProvider, { ...s.combination, ...config })
  const journal = () => {
    const found = ctx.get(agentJournalKey)
    if (found === undefined) throw new Error('agentJournal is not provided')
    return found as AgentJournal<string>
  }
  return { ctx, plugin, journal, wiring: services.wiring }
}

/**
 * The Journal of the scene's session without the plugin: `createSessionLogJournal(...).forSession`
 * over the same scripted storage, so the core suite can tell a fault of the provider from one of
 * the plugin's routing.
 */
async function direct(s: SqlScene) {
  const services = servicesOf(s, await otherDomainOf(s))
  const journal = createSessionLogJournal<string>({
    storage: services.storage,
    tenantDomainLookup: services.lookup,
    sessionAccessCheck: { check: services.check },
    combination: s.combination,
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
      expect(ctx.get(agentJournalKey)).toBeUndefined()
      await mount(ctx, providers[absent])
      expect(fiber.state).toBe(ACTIVE)
      expect(ctx.get(agentJournalKey)).toBeDefined()
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
        checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
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

/**
 * The core suite's fixture through the plugin: each case opens its own scene and its own Cordis
 * root, and the execution through `agentJournal`. The plugin's Journal holds no cancellation
 * policy: a case that asks for one is reported uncovered, a case that asks for none is driven.
 * Host records, settlement qualifications, legacy candidates and reply admission controls have no
 * seam in the production provider; those cases are uncovered too.
 */
const coreFixtureVia = (via: 'plugin' | 'direct'): AgentJournalCoreFixture<string> => ({
  async open(name, options = {}): Promise<AgentJournalCoreOpened<string>> {
    const s = await scene(`${via === 'plugin' ? 'pj' : 'pd'}-${name}`.slice(0, 48))
    const { journal: current, wiring } = via === 'plugin' ? await assembled(s) : await direct(s)
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
      ...(options.cancellationPolicy === 'absent' ? { installation: null } : {}),
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
