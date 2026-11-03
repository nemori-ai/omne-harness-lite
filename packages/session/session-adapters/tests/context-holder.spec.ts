// AD-03 on real Cordis: the Runtime Context holder of Session. What is checked: the replay
// sub-plugin reads the session's context records with the `reader` caller class and is the only
// caller of `applyCommit`; a scope it has not recovered starts a recovery session whose material
// holds the registrations in log order, the checkpointed blocks that have a step commit (and no
// other block), and the end; `out-of-order` starts a recovery session that supersedes the current
// one; the facts plugin `session-ad03-facts` (R2-D29) reads the same records through its history
// sub-plugin (`reader`), outside the replay, and its `replayFacts.stepCommittedBlocks` makes C18's
// trust refuse a finish that leaves out a step-committed block; the
// `runtimeContextReaderEligibility` provider passes the handoff suite, refuses another tenant
// before it reads anything, and issues per consumer class; a new scope with no record is recovered
// with the empty material only while the snapshot lists it open (R2-D219 B1); the holder and replay
// plugins stay absent while a dependency is absent, and a new Runtime Context provider makes the
// scope recover again before the next eligibility.
//
// Runtime Context is the contract's memory double behind a Cordis service, with C18's trust built
// from the test authority ports and the facts plugin's `replayFacts`. The translation from a Session
// entry to a Runtime Context commit input is a scripted double; AD-12's real translation is checked
// in `context-input.spec.ts`. The session service records every call with the plugin that made it
// and that plugin's caller class.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type CommitInput,
  type ContextBlockKey,
  type FinishReplayAction,
  type NeedBinding,
  type ReaderEligibilityRequest,
  type ReplayMaterial,
  type ScopeRef,
  type StatefulBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import {
  RuntimeContextService,
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { readerEligibilityConformance } from '@omne-harness/runtime-context-cordis-contract/testing'
import type {
  EntryId,
  HistoryEntry,
  HistoryPage,
  SessionAccess,
  SessionFaces,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  memoryAccess,
  memoryOtherAccess,
} from '@omne-harness/session-contract/testing'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import {
  createSessionContextHolder,
  type SessionContextTranslation,
} from '../src/cordis/context-holder.ts'
import { createSessionRuntimeContextTrust } from '../src/runtime-context-trust.ts'

// --- values --------------------------------------------------------------------------------------

const A = memoryAccess<unknown>('unused')
const B = memoryOtherAccess<unknown>('unused', 'session-b')

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}
const coordinatorOf = (tenant: TenantId, session: SessionId) =>
  `coordinator:${textOf(tenant)}:${session}`

function scopeRef(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}
const scopeA = scopeRef('session-scope:a')
const scopeB = scopeRef('session-scope:b')

const numberShape = {
  '~standard': {
    version: 1 as const,
    vendor: 'context-holder-spec',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}

const NOTES: ContextBlockKey = 'test.notes'
const DRAFT: ContextBlockKey = 'test.draft'
const SCRATCH: ContextBlockKey = 'test.scratch'

function stateful(
  key: ContextBlockKey,
  persistence: 'checkpointed' | 'untracked',
): StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> {
  return {
    kind: 'stateful',
    key,
    schema: numberShape,
    required: false,
    consumers: ['model'],
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    writers: ['tool'],
    singleWriterPerStep: true,
    persistence,
    reduce: (previous, update) => Number(previous ?? 0) + Number(update),
    updateSchema: numberShape,
  }
}
function modelNeed(key: ContextBlockKey): NeedBinding {
  return {
    key,
    need: {
      name: key,
      shape: numberShape,
      consumer: 'model',
      purpose: 'test',
      necessity: 'optional',
    },
  }
}
function toolNeed(key: ContextBlockKey): NeedBinding {
  return {
    key,
    need: {
      name: `tool:${key}`,
      shape: numberShape,
      consumer: 'tool',
      purpose: 'test',
      necessity: 'optional',
    },
    translate: value => value,
    // The integrator reads the source block, so it must be one of the block's consumers (RC-06).
    integrator: 'model',
  }
}

type Target = Readonly<{ scope: ScopeRef; tenant: TenantId }>
const atA: Target = { scope: scopeA, tenant: A.tenant }
const atB: Target = { scope: scopeB, tenant: B.tenant }

function add(
  at: Target,
  commit: string,
  key: ContextBlockKey,
  basedOn: number,
  persistence: 'checkpointed' | 'untracked',
  bindings: readonly NeedBinding[] = [modelNeed(key)],
): CommitInput {
  return {
    kind: 'registration',
    commit: { commit },
    change: {
      kind: 'add',
      scope: at.scope,
      tenant: at.tenant,
      key,
      basedOn,
      creating: true,
      bindings,
      parameters: undefined,
      required: false,
      declaration: stateful(key, persistence),
    },
  }
}
function remove(at: Target, commit: string, key: ContextBlockKey, basedOn: number): CommitInput {
  return {
    kind: 'registration',
    commit: { commit },
    change: { kind: 'remove', scope: at.scope, tenant: at.tenant, key, basedOn, creating: false },
  }
}
function step(at: Target, commit: string, key: ContextBlockKey, value: number): CommitInput {
  return {
    kind: 'step',
    commit: { commit },
    tenant: at.tenant,
    executionEnded: false,
    stepCommit: {
      scope: at.scope,
      step: { step: `${commit}-step` },
      committed: [
        {
          key,
          value,
          updates: [{ origin: { origin: `${commit}-origin` }, key, update: value, writer: 'tool' }],
        },
      ],
      pending: [],
    },
  }
}
function end(at: Target, commit: string): CommitInput {
  return { kind: 'scope', commit: { commit }, scope: at.scope, tenant: at.tenant, scopeEnded: true }
}

const REGISTRATION = 'session.context-registration-changed'
const STEP = 'session.recovery-input-adopted'
const ARCHIVED = 'session.archived'

// --- the fixture -----------------------------------------------------------------------------------

type Call = Readonly<{ method: string; input: unknown; principal?: unknown }>
/** One call of the session service: the plugin that made it, its caller class, the method. */
type SessionCall = Readonly<{ plugin: string; caller: unknown; method: string; input: unknown }>
const REPLAY = 'session-ad03-replay'
const FACTS = 'session-ad03-facts'
const FACTS_HISTORY = 'session-ad03-facts-history'
const HOLDER = 'session-ad03'
/** What a scripted entry records; a function gets the session the holder reads it for. */
type Scripted =
  | CommitInput
  | null
  | ((session: Readonly<{ tenant: TenantId }>) => CommitInput | null)

const sessionKey = (access: { tenant: TenantId; session: SessionId }) =>
  JSON.stringify([textOf(access.tenant), access.session])

/**
 * A real Cordis root with a memory Runtime Context behind its service, a session service that
 * serves the history face from a per-session log (pages of two entries, only to the coordinator
 * principal of that session) and the work snapshot, and the three AD-03 plugins. Each call is
 * recorded with the plugin that made it: `replayCalls`, `factsCalls` (snapshot reads),
 * `factsHistoryCalls` (record reads of the facts plugin) and `holderCalls`.
 */
async function assembled(options: { mount?: readonly ('rc' | 'session')[] } = {}) {
  const ctx = new Context()
  const logged: { name: string; type: string }[] = []
  ctx.logger.exporter({
    export: message => logged.push({ name: message.name, type: message.type }),
  })
  const faults = {
    outOfOrder: 0,
    finish: 0,
    history: false,
    principal: false,
    incomplete: false,
    /** `readWork` answers `unavailable`. */
    work: false,
  }
  const rcCalls: Call[] = []
  const sessionCalls: SessionCall[] = []
  const callsOf = (plugin: string) => sessionCalls.filter(call => call.plugin === plugin)
  const principalsAsked: unknown[] = []

  // The session log: entries per session and the commit input each entry records.
  const logs = new Map<string, HistoryEntry[]>()
  const inputs = new Map<string, Scripted>()
  let serial = 0
  /** `undefined` leaves the entry without a scripted input, so its translation fails. */
  function append(access: SessionAccess<unknown>, kind: string, input?: Scripted) {
    serial++
    const entry: HistoryEntry = {
      id: `entry-${serial}` as EntryId,
      revision: String(serial) as SessionRevision,
      kind,
      schema: adoption('test-entry'),
      payload: { kind: 'null' },
      origin: { owner: 'session', via: null, source: evidence(`entry-${serial}`) },
    }
    const key = sessionKey(access)
    logs.set(key, [...(logs.get(key) ?? []), entry])
    if (input !== undefined) inputs.set(entry.id, input)
    return entry
  }

  const translation: SessionContextTranslation = {
    kinds: [REGISTRATION, STEP, ARCHIVED],
    commitOf: (entry, session) => {
      const input = inputs.get(entry.id)
      if (input === undefined) return fail('no commit input scripted for this entry')
      return succeed(typeof input === 'function' ? input(session) : input)
    },
  }

  const holder = createSessionContextHolder<unknown>({
    coordinator: async input => {
      principalsAsked.push(input)
      if (faults.principal) return fail({ kind: 'unavailable', owner: 'test', diagnostic: 'down' })
      return succeed(coordinatorOf(input.tenant, input.session))
    },
    translation,
  })
  const ports = createTestAuthorityPorts<unknown>()
  ports.bind(scopeA, A.tenant)
  ports.bind(scopeB, B.tenant)
  const trust = createSessionRuntimeContextTrust<unknown>({
    authority: ports.authority,
    bindings: ports.bindings,
    current: { capture: () => ({ current: () => true }) },
    replayFacts: holder.replayFacts,
  })

  class RuntimeContext extends RuntimeContextService<unknown> {
    readonly memory = createMemoryRuntimeContext<unknown>(trust)
    constructor(scope: Context) {
      super(scope)
      scope.effect(() => () => void this.memory.close())
    }
    private record(method: string, principal: unknown, input: unknown) {
      rcCalls.push({ method, principal, input })
    }
    readonly registerProducer: RuntimeContextService<unknown>['registerProducer'] = (...args) =>
      this.memory.registerProducer(...args)
    readonly prepareRegistration: RuntimeContextService<unknown>['prepareRegistration'] = (
      principal,
      change,
    ) => this.memory.prepareRegistration(principal, change)
    readonly issueEligibility: RuntimeContextService<unknown>['issueEligibility'] = (
      principal,
      material,
    ) => {
      this.record('issueEligibility', principal, material)
      return this.memory.issueEligibility(principal, material)
    }
    readonly revokeEligibility: RuntimeContextService<unknown>['revokeEligibility'] = (
      principal,
      id,
    ) => this.memory.revokeEligibility(principal, id)
    readonly applyCommit: RuntimeContextService<unknown>['applyCommit'] = async (
      principal,
      input,
    ) => {
      this.record('applyCommit', principal, input)
      if (faults.outOfOrder > 0) {
        faults.outOfOrder--
        return { kind: 'invalid', reason: 'out-of-order', current: 0 }
      }
      return this.memory.applyCommit(principal, input)
    }
    readonly beginReplay: RuntimeContextService<unknown>['beginReplay'] = (principal, input) => {
      this.record('beginReplay', principal, input)
      return this.memory.beginReplay(principal, input)
    }
    readonly finishReplay: RuntimeContextService<unknown>['finishReplay'] = (principal, input) => {
      this.record('finishReplay', principal, input)
      if (faults.finish > 0) {
        faults.finish--
        return Promise.resolve({ kind: 'unavailable', cause: 'replay' } as const)
      }
      return this.memory.finishReplay(principal, input)
    }
    readonly bind: RuntimeContextService<unknown>['bind'] = id => this.memory.bind(id)
  }

  const owns = (access: SessionAccess<unknown>) =>
    access.principal === coordinatorOf(access.tenant, access.session)
  function page(key: string, kinds: readonly string[], offset: number): HistoryPage {
    const all = (logs.get(key) ?? []).filter(entry => kinds.includes(entry.kind))
    const entries = all.slice(offset, offset + 2)
    const more = offset + 2 < all.length
    return {
      source: key,
      interpreter: adoption('test-interpreter'),
      upper: String(serial) as SessionRevision,
      entries,
      scannedThrough: String(offset + entries.length),
      next: more ? JSON.stringify([key, kinds, offset + 2]) : null,
      exhausted: !more && !faults.incomplete,
      annotations: [],
    }
  }
  // The history face admits the `reader` class only (session-contract「四个面与公开操作」); another
  // class is refused as the provider refuses it. Both readers of the records (the replay sub-plugin
  // and the history sub-plugin of the facts plugin) are `reader`, so both land in `historyCalls`.
  const historyFaceFor = (caller: unknown, plugin: string): SessionFaces<unknown>['history'] => {
    const reader = (caller as { caller?: unknown }).caller === 'reader'
    const calls = {
      push: (call: Omit<SessionCall, 'plugin'>) => sessionCalls.push({ plugin, ...call }),
    }
    return {
      begin: async input => {
        calls.push({ method: 'begin', input, caller })
        if (!reader || !owns(input)) return fail({ kind: 'denied', action: 'history.begin' })
        if (faults.history)
          return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'history down' })
        return succeed(page(sessionKey(input), input.kinds, 0))
      },
      next: async input => {
        calls.push({ method: 'next', input, caller })
        if (!reader || !owns(input)) return fail({ kind: 'denied', action: 'history.next' })
        const [key, kinds, offset] = JSON.parse(input.cursor) as [string, string[], number]
        if (key !== sessionKey(input)) return fail({ kind: 'denied', action: 'history.next' })
        return succeed(page(key, kinds, offset))
      },
      since: async () => fail({ kind: 'unavailable', owner: 'session', diagnostic: 'not used' }),
      readModelView: async () =>
        fail({ kind: 'unavailable', owner: 'session', diagnostic: 'not used' }),
    }
  }
  // The context scopes of each session's snapshot, as Session mints them (J18). `readWork` admits
  // `coordinator` and `maintainer` (session-contract「四个面与公开操作」).
  const scopes = new Map<string, { scope: string; ended: unknown }[]>()
  const mint = (access: SessionAccess<unknown>, scope: ScopeRef, ended: unknown = null) => {
    const key = sessionKey(access)
    scopes.set(key, [
      ...(scopes.get(key) ?? []),
      { scope: scope.ref, ended, generation: String((scopes.get(key)?.length ?? 0) + 1) } as never,
    ])
  }
  /** Ends a scope in its session's snapshot, as the archive commits it. */
  const endScope = (access: SessionAccess<unknown>, scope: ScopeRef) => {
    const key = sessionKey(access)
    scopes.set(
      key,
      (scopes.get(key) ?? []).map(item =>
        item.scope === scope.ref ? { ...item, ended: evidence('archived') } : item,
      ),
    )
  }
  const workFaceFor = (caller: unknown, plugin: string): SessionFaces<unknown>['work'] =>
    ({
      readWork: async (input: SessionAccess<unknown>) => {
        sessionCalls.push({ plugin, caller, method: 'readWork', input })
        const allowed = ['coordinator', 'maintainer'].includes(
          String((caller as { caller?: unknown }).caller),
        )
        if (!allowed || !owns(input)) return fail({ kind: 'denied', action: 'readWork' })
        if (faults.work)
          return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'work down' })
        return succeed({
          tenant: input.tenant,
          session: input.session,
          contextScopes: scopes.get(sessionKey(input)) ?? [],
        })
      },
    }) as unknown as SessionFaces<unknown>['work']
  class Session extends SessionService<unknown> {
    // `this.ctx` is the caller's context (service-method-ctx-is-caller): its fiber names the plugin.
    get history(): SessionFaces<unknown>['history'] {
      return historyFaceFor(this[Service.resolveConfig](), this.ctx.fiber.name)
    }
    get work(): SessionFaces<unknown>['work'] {
      return workFaceFor(this[Service.resolveConfig](), this.ctx.fiber.name)
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
  }

  const services = { rc: RuntimeContext, session: Session } as const
  const fibers = new Map<string, Awaited<ReturnType<Context['plugin']>>>()
  for (const name of options.mount ?? (['rc', 'session'] as const))
    fibers.set(name, await mount(ctx, services[name]))
  const factsFiber = await mount(ctx, holder.facts)
  const replayFiber = await mount(ctx, holder.replay)
  const holderFiber = await mount(ctx, holder.holder)

  /** Dispatches the committed notice of one session batch, as the session provider does. */
  const committed = (access: SessionAccess<unknown>, kinds: readonly string[]) =>
    ctx.parallel(
      'session-cordis-contract/committed',
      access.tenant,
      access.session,
      String(serial) as SessionRevision,
      evidence(`batch-${serial}`),
      kinds,
    )
  const handoff = () => ctx.get(runtimeContextReaderEligibilityKey)

  return {
    ctx,
    holder,
    trust,
    ports,
    faults,
    services,
    fibers,
    factsFiber,
    replayFiber,
    holderFiber,
    rcCalls,
    sessionCalls,
    get replayCalls() {
      return callsOf(REPLAY)
    },
    get factsCalls() {
      return callsOf(FACTS)
    },
    get factsHistoryCalls() {
      return callsOf(FACTS_HISTORY)
    },
    get holderCalls() {
      return callsOf(HOLDER)
    },
    principalsAsked,
    append,
    mint,
    endScope,
    committed,
    handoff,
    methods: () => rcCalls.map(call => call.method),
    errors: () =>
      logged.filter(
        entry => entry.type === 'error' && entry.name === 'session-adapters/context-holder',
      ),
  }
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

/** The create batch of scope A: two checkpointed blocks and an untracked one, two step commits. */
function seedA(f: Awaited<ReturnType<typeof assembled>>) {
  f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
  f.append(A, REGISTRATION, add(atA, 'r2', SCRATCH, 1, 'untracked'))
  f.append(A, REGISTRATION, add(atA, 'r3', DRAFT, 2, 'checkpointed'))
  f.append(A, STEP, step(atA, 's1', NOTES, 1))
  f.append(A, STEP, step(atA, 's2', SCRATCH, 5))
  f.append(A, STEP, step(atA, 's3', NOTES, 3))
}

const modelRequest: ReaderEligibilityRequest<unknown> = {
  principal: 'reader:a',
  tenant: A.tenant,
  scope: scopeA,
  consumer: 'model',
}

function lastInput<T>(f: Awaited<ReturnType<typeof assembled>>, method: string): T {
  const calls = f.rcCalls.filter(call => call.method === method)
  const last = calls.at(-1)
  if (last === undefined) throw new Error(`no ${method} call`)
  return last.input as T
}

// --- recovery ------------------------------------------------------------------------------------

describe('a scope seen for the first time is recovered with the complete material (1a)', () => {
  it('reads the records as reader, begins at the last commit and finishes with registrations, step-committed checkpointed blocks and no end', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])

    expect(f.methods()).toEqual(['beginReplay', 'finishReplay'])
    expect(lastInput(f, 'beginReplay')).toEqual({
      scope: scopeA,
      tenant: A.tenant,
      through: { commit: 's3' },
      supersedes: null,
    })
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.registrations.map(item => item.commit.commit)).toEqual(['r1', 'r2', 'r3'])
    // Only NOTES: SCRATCH is untracked, DRAFT has no step commit yet (P4 B6 (a)).
    expect(material.checkpoints).toEqual([
      {
        commit: { commit: 's3' },
        step: { step: 's3-step' },
        blocks: [{ key: NOTES, value: 3, updates: [] }],
      },
    ])
    expect(material.end).toBeNull()
    // Every principal on the holder face is the session's coordinator principal.
    const principal = coordinatorOf(A.tenant, A.session)
    expect(f.rcCalls.every(call => call.principal === principal)).toBe(true)
    // The replay sub-plugin and the history sub-plugin of the facts plugin read the records as
    // `reader`; the facts plugin reads the snapshot as `coordinator`. Each plugin calls `session`
    // with one caller class (AD-00 rule 1).
    const classOf = (call: SessionCall) => (call.caller as { caller?: unknown }).caller
    expect(f.replayCalls.length).toBeGreaterThan(0)
    expect(f.replayCalls.every(call => classOf(call) === 'reader')).toBe(true)
    expect(f.replayCalls.map(call => call.method)).toContain('next')
    expect(f.factsHistoryCalls.length).toBeGreaterThan(0)
    expect(f.factsHistoryCalls.every(call => classOf(call) === 'reader')).toBe(true)
    expect(f.factsCalls.map(call => call.method)).toEqual(['readWork'])
    expect(f.factsCalls.every(call => classOf(call) === 'coordinator')).toBe(true)
    for (const plugin of new Set(f.sessionCalls.map(call => call.plugin)))
      expect(new Set(f.sessionCalls.filter(call => call.plugin === plugin).map(classOf)).size).toBe(
        1,
      )
  })

  it('finishes ready through C18 trust: the facts the replay asks name exactly the step-committed checkpointed blocks', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 's3' })).toEqual({
      kind: 'known',
      keys: [NOTES],
    })
    // The handoff can now issue: the fence is open.
    const answer = await f.handoff()!.current(modelRequest)
    expect(answer.kind).toBe('current')
  })

  it('groups each block under the commit and step of its own latest step commit', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
    f.append(A, REGISTRATION, add(atA, 'r2', DRAFT, 1, 'checkpointed'))
    f.append(A, STEP, step(atA, 's1', NOTES, 1))
    f.append(A, STEP, step(atA, 's2', DRAFT, 2))
    await f.committed(A, [REGISTRATION, STEP])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.checkpoints).toEqual([
      {
        commit: { commit: 's1' },
        step: { step: 's1-step' },
        blocks: [{ key: NOTES, value: 1, updates: [] }],
      },
      {
        commit: { commit: 's2' },
        step: { step: 's2-step' },
        blocks: [{ key: DRAFT, value: 2, updates: [] }],
      },
    ])
  })

  it('carries the confirmed end and does not apply records of another scope', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
    f.append(A, ARCHIVED, end(atA, 'end-1'))
    await f.committed(A, [REGISTRATION, ARCHIVED])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.end).toEqual({ commit: { commit: 'end-1' } })
    // A scope that ended issues no ordinary eligibility.
    expect(await f.handoff()!.current(modelRequest)).toEqual({ kind: 'absent' })
  })

  it('a removed block leaves the material even when it had a step commit', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
    f.append(A, STEP, step(atA, 's1', NOTES, 1))
    f.append(A, REGISTRATION, remove(atA, 'r2', NOTES, 1))
    await f.committed(A, [REGISTRATION, STEP])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.registrations.map(item => item.change.kind)).toEqual(['add', 'remove'])
    expect(material.checkpoints).toEqual([])
  })
  it('a step commit from before a removal does not count for the block added again', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
    f.append(A, STEP, step(atA, 's1', NOTES, 1))
    f.append(A, REGISTRATION, remove(atA, 'r2', NOTES, 1))
    f.append(A, REGISTRATION, add(atA, 'r3', NOTES, 2, 'checkpointed'))
    await f.committed(A, [REGISTRATION, STEP])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.checkpoints).toEqual([])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 'r3' })).toEqual({
      kind: 'known',
      keys: [],
    })
  })

  it('a recovery that did not complete is tried again, superseding its own replay, before the next eligibility', async () => {
    const f = await assembled()
    seedA(f)
    f.faults.finish = 1
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay'])
    const answer = await f.handoff()!.current(modelRequest)
    expect(answer.kind).toBe('current')
    expect(f.methods()).toEqual([
      'beginReplay',
      'finishReplay',
      'beginReplay',
      'finishReplay',
      'issueEligibility',
    ])
    const begins = f.rcCalls.filter(call => call.method === 'beginReplay')
    expect((begins[1]!.input as { supersedes: unknown }).supersedes).not.toBeNull()
  })
})

describe('the replay sub-plugin is the only caller of applyCommit', () => {
  it('applies a later registration by its original commit and full input, once', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const later = add(atA, 'r4', 'test.later', 3, 'checkpointed')
    f.append(A, REGISTRATION, later)
    await f.committed(A, [REGISTRATION])
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay', 'applyCommit'])
    expect(lastInput(f, 'applyCommit')).toEqual(later)
    // A notice that repeats does not apply the same commit again.
    await f.committed(A, [REGISTRATION])
    expect(f.methods().filter(method => method === 'applyCommit')).toHaveLength(1)
  })

  it('ignores a notice whose kinds hold no context record', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, ['run.terminal'])
    expect(f.methods()).toEqual([])
    expect(f.replayCalls).toEqual([])
  })

  it('the handoff path recovers and issues but never applies a commit', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    await f.handoff()!.current(modelRequest)
    await f.handoff()!.current({ ...modelRequest, consumer: 'tool' })
    expect(f.methods().filter(method => method === 'applyCommit')).toEqual([])
  })

  it('out-of-order starts a recovery session that supersedes the current one, and does not apply the covered commit again', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const first = f.rcCalls.length
    const later = add(atA, 'r4', 'test.later', 3, 'checkpointed')
    f.append(A, REGISTRATION, later)
    f.faults.outOfOrder = 1
    await f.committed(A, [REGISTRATION])

    expect(f.methods().slice(first)).toEqual(['applyCommit', 'beginReplay', 'finishReplay'])
    const begun = lastInput<{ supersedes: unknown; through: unknown }>(f, 'beginReplay')
    expect(begun.through).toEqual({ commit: 'r4' })
    expect(begun.supersedes).not.toBeNull()
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material.registrations.map(item => item.commit.commit)).toEqual(['r1', 'r2', 'r3', 'r4'])
    await f.committed(A, [REGISTRATION])
    expect(f.methods().slice(first)).toEqual(['applyCommit', 'beginReplay', 'finishReplay'])
  })

  it('a translation defect is reported and nothing is applied or recovered', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed'))
    // An entry of a context kind with no scripted input: the translation fails.
    f.append(A, REGISTRATION)
    await f.committed(A, [REGISTRATION])
    expect(f.methods()).toEqual([])
    expect(f.errors().length).toBeGreaterThan(0)
  })

  it('a record that names another tenant than its session is a defect, not a scope of that session', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atB, 'r1', NOTES, 0, 'checkpointed'))
    await f.committed(A, [REGISTRATION])
    expect(f.methods()).toEqual([])
    expect(f.errors().length).toBeGreaterThan(0)
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeB, null)).toEqual({
      kind: 'unavailable',
    })
  })
})

// --- replay facts (C18's port, P4 N5) --------------------------------------------------------------

describe('replayFacts.stepCommittedBlocks', () => {
  it('names the checkpointed blocks of the final registration that have a step commit up to through', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const facts = f.holder.replayFacts
    expect(await facts.stepCommittedBlocks(scopeA, { commit: 's1' })).toEqual({
      kind: 'known',
      keys: [NOTES],
    })
    // Up to r3 no step commit exists yet.
    expect(await facts.stepCommittedBlocks(scopeA, { commit: 'r3' })).toEqual({
      kind: 'known',
      keys: [],
    })
    expect(await facts.stepCommittedBlocks(scopeA, null)).toEqual({ kind: 'known', keys: [] })
  })

  it('a checkpoint the log does not hold is unknown, not an empty answer', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 'gone' })).toEqual({
      kind: 'unknown',
    })
  })

  it('a scope the holder has not seen, and a history that cannot be read, are unavailable', async () => {
    const f = await assembled()
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, null)).toEqual({
      kind: 'unavailable',
    })
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    f.faults.history = true
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 's3' })).toEqual({
      kind: 'unavailable',
    })
    f.faults.history = false
    f.faults.incomplete = true
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 's3' })).toEqual({
      kind: 'unavailable',
    })
  })

  it('makes C18 trust answer replay-incomplete for a finish that leaves out a step-committed block (N5)', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    const action = (given: ReplayMaterial): FinishReplayAction => ({
      kind: 'finish-replay',
      scope: scopeA,
      tenant: A.tenant,
      replay: { replay: 'replay-x' },
      through: { commit: 's3' },
      material: given,
      previous: { checkpoint: null, registrationRevision: 0, end: null },
      appliedCommits: [],
    })
    const principal = coordinatorOf(A.tenant, A.session)
    const complete = await f.trust.authority.holder(principal, action(material))
    expect(complete.kind).toBe('authorized')
    const missing = await f.trust.authority.holder(
      principal,
      action({ ...material, checkpoints: [] }),
    )
    expect(missing).toEqual({ kind: 'invalid', reason: 'replay-incomplete' })
  })
})

// --- the reader eligibility handoff (K-RC) ------------------------------------------------------------

describe('the runtimeContextReaderEligibility provider', () => {
  describe('readerEligibilityConformance', () => {
    it('passes every case of the handoff suite', async () => {
      const f = await assembled()
      seedA(f)
      await f.committed(A, [REGISTRATION, STEP])
      const handoff = f.handoff()!
      const first = await handoff.current(modelRequest)
      if (first.kind !== 'current') throw new Error(`expected current, got ${first.kind}`)
      const cases = readerEligibilityConformance<unknown>({
        handoff,
        held: { request: modelRequest, eligibility: first.eligibility },
        otherTenant: B.tenant,
      })
      expect(cases.map(item => item.name)).toEqual([
        'held-eligibility-is-current',
        'other-tenant-is-refused',
        'other-consumer-gets-no-held-eligibility',
      ])
      for (const item of cases) await item.run()
    })
  })

  it('answers the held eligibility again without issuing a second one', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const first = await f.handoff()!.current(modelRequest)
    const again = await f.handoff()!.current(modelRequest)
    expect(again).toEqual(first)
    expect(f.methods().filter(method => method === 'issueEligibility')).toHaveLength(1)
    const material = lastInput<Record<string, unknown>>(f, 'issueEligibility')
    expect(material).toMatchObject({
      scope: scopeA,
      tenant: A.tenant,
      consumer: 'model',
      principal: 'reader:a',
      keys: [NOTES, SCRATCH, DRAFT],
      bindings: [],
      supersedes: null,
    })
  })

  it('refuses another tenant before it reads the session or issues', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const reads = f.sessionCalls.length
    const issued = f.methods().length
    expect(await f.handoff()!.current({ ...modelRequest, tenant: B.tenant })).toEqual({
      kind: 'refused',
    })
    expect(f.sessionCalls.length).toBe(reads)
    expect(f.methods().length).toBe(issued)
  })

  it('issues per consumer class: the tool gets its translated binding, not the model keys', async () => {
    const f = await assembled()
    f.append(A, REGISTRATION, add(atA, 'r1', NOTES, 0, 'checkpointed', [modelNeed(NOTES)]))
    f.append(
      A,
      REGISTRATION,
      add(atA, 'r2', DRAFT, 1, 'checkpointed', [modelNeed(DRAFT), toolNeed(DRAFT)]),
    )
    await f.committed(A, [REGISTRATION])
    const answer = await f.handoff()!.current({ ...modelRequest, consumer: 'tool' })
    expect(answer.kind).toBe('current')
    expect(lastInput(f, 'issueEligibility')).toMatchObject({
      consumer: 'tool',
      keys: [],
      bindings: [{ need: `tool:${DRAFT}`, key: DRAFT }],
    })
  })

  it('issues an eligibility with no key to a consumer class that the registrations give nothing to read', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const answer = await f.handoff()!.current({ ...modelRequest, consumer: 'extension' })
    expect(answer.kind).toBe('current')
    expect(lastInput(f, 'issueEligibility')).toMatchObject({
      consumer: 'extension',
      keys: [],
      bindings: [],
    })
  })

  it('recovers a newly minted scope that has no context record with the empty material and issues an empty eligibility (AD-03 1a)', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await f.committed(A, ['session.created'])
    const answer = await f.handoff()!.current(modelRequest)
    if (answer.kind !== 'current')
      throw new Error(`expected current, got ${JSON.stringify(answer)}`)
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay', 'issueEligibility'])
    expect(lastInput(f, 'beginReplay')).toMatchObject({ scope: scopeA, through: null })
    expect(lastInput(f, 'issueEligibility')).toMatchObject({ keys: [], bindings: [] })
    // The reader of that eligibility reads the empty snapshot: a value, not a missing one.
    const rc = f.ctx.get(runtimeContextKey) as RuntimeContextService<unknown>
    const bound = await rc.bind(answer.eligibility)
    if (bound.kind !== 'bound') throw new Error(`expected bound, got ${bound.kind}`)
    const snapshot = await bound.reader.snapshot()
    expect(snapshot).toMatchObject({ kind: 'success', value: { blocks: [], missing: [] } })
  })

  it('indexes the snapshot scopes on the first notice of a session even when its kinds do not name the creation, and only once', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    // The creation entry can fall outside the notice's page: the first notice names other kinds.
    await f.committed(A, ['intake.routed'])
    await f.committed(A, [REGISTRATION])
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('current')
    // The facts plugin reads the snapshot once; the holder reads it once more, to see the new
    // scope still open before the empty material (R2-D219 B1).
    expect(f.factsCalls.filter(call => call.method === 'readWork')).toHaveLength(1)
    expect(f.holderCalls.map(call => call.method)).toEqual(['readWork'])
  })

  it('a scope that no snapshot lists stays unseen, and an ended one is not indexed', async () => {
    const f = await assembled()
    // A creation notice whose snapshot lists only an ended scope, and no notice for scope B.
    f.mint(A, scopeA, evidence('ended'))
    await f.committed(A, ['session.created'])
    for (const request of [modelRequest, { ...modelRequest, scope: scopeB, tenant: B.tenant }])
      expect(await f.handoff()!.current(request)).toEqual({
        kind: 'unavailable',
        diagnostic: 'the holder has not seen this scope in the session log',
      })
    expect(f.methods()).toEqual([])
  })

  it('R2-D219 B1 P1: a new scope that ended before its first eligibility is absent, not recovered open, even when no record of its end is read', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await f.committed(A, ['session.created'])
    // The archive ends the scope in the snapshot; its entry records no commit the replay can read.
    f.endScope(A, scopeA)
    f.append(A, ARCHIVED, null)
    await f.committed(A, [ARCHIVED])
    expect(await f.handoff()!.current(modelRequest)).toEqual({ kind: 'absent' })
    // Nothing was recovered open and nothing was issued.
    expect(f.methods()).toEqual([])
  })

  it('R2-D219 B1: the end of a scope with no other record reaches Runtime Context with the tenant of its session', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await f.committed(A, ['session.created'])
    f.endScope(A, scopeA)
    f.append(A, ARCHIVED, session => end({ scope: scopeA, tenant: session.tenant }, 'end-1'))
    await f.committed(A, [ARCHIVED])
    expect(await f.handoff()!.current(modelRequest)).toEqual({ kind: 'absent' })
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay'])
    const { material } = lastInput<{ material: ReplayMaterial }>(f, 'finishReplay')
    expect(material).toEqual({
      registrations: [],
      checkpoints: [],
      end: { commit: { commit: 'end-1' } },
    })
  })

  it('R2-D219 B1 P2: a new scope recovered with the empty material and then archived is absent, and Runtime Context ends it', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await f.committed(A, ['session.created'])
    const first = await f.handoff()!.current(modelRequest)
    if (first.kind !== 'current') throw new Error(`expected current, got ${JSON.stringify(first)}`)
    f.endScope(A, scopeA)
    f.append(A, ARCHIVED, session => end({ scope: scopeA, tenant: session.tenant }, 'end-1'))
    await f.committed(A, [ARCHIVED])
    expect(lastInput(f, 'applyCommit')).toEqual(end(atA, 'end-1'))
    expect(await f.handoff()!.current(modelRequest)).toEqual({ kind: 'absent' })
    // Runtime Context knows the end: the reader of the earlier eligibility is refused.
    const rc = f.ctx.get(runtimeContextKey) as RuntimeContextService<unknown>
    const bound = await rc.bind(first.eligibility)
    const read = bound.kind === 'bound' ? await bound.reader.snapshot() : bound
    expect(read).toMatchObject({ kind: 'refused', reason: 'scope-ended' })
  })

  it('R2-D219 B1: a new scope whose snapshot cannot be read is unavailable, and recovered once the snapshot reads', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await f.committed(A, ['session.created'])
    f.faults.work = true
    expect(await f.handoff()!.current(modelRequest)).toEqual({
      kind: 'unavailable',
      diagnostic: 'the session snapshot: the snapshot read answered unavailable',
    })
    expect(f.methods()).toEqual([])
    f.faults.work = false
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('current')
    expect(
      f.holderCalls.every(call => (call.caller as { caller?: unknown }).caller === 'coordinator'),
    ).toBe(true)
  })

  it('R2-D219: a first-notice snapshot read that failed is read again on demand, and while it fails its own reason is the answer', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    f.faults.work = true
    await f.committed(A, ['session.created'])
    const failing = await f.handoff()!.current(modelRequest)
    expect(failing).toEqual({
      kind: 'unavailable',
      diagnostic:
        'the open scopes of a session could not be indexed: the snapshot read answered unavailable',
    })
    f.faults.work = false
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('current')
    // A scope of another tenant does not read this tenant's sessions again.
    const reads = f.sessionCalls.length
    f.faults.work = true
    await f.committed(B, ['session.created'])
    f.faults.work = false
    const before = f.sessionCalls.length
    expect(before).toBeGreaterThan(reads)
    expect(
      (await f.handoff()!.current({ ...modelRequest, scope: scopeB, tenant: A.tenant })).kind,
    ).toBe('unavailable')
    expect(f.sessionCalls.length).toBe(before)
  })

  it('R2-D219 P3: two concurrent first notices of a session share one snapshot read', async () => {
    const f = await assembled()
    f.mint(A, scopeA)
    await Promise.all([f.committed(A, ['intake.routed']), f.committed(A, ['run.terminal'])])
    expect(f.factsCalls.filter(call => call.method === 'readWork')).toHaveLength(1)
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('current')
  })

  it('reissues with supersedes when a later registration changes the revision', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const first = await f.handoff()!.current(modelRequest)
    if (first.kind !== 'current') throw new Error('fixture: first eligibility')
    f.append(A, REGISTRATION, add(atA, 'r4', 'test.later', 3, 'checkpointed'))
    await f.committed(A, [REGISTRATION])
    const second = await f.handoff()!.current(modelRequest)
    if (second.kind !== 'current') throw new Error(`expected current, got ${second.kind}`)
    expect(second.eligibility).not.toEqual(first.eligibility)
    expect(lastInput(f, 'issueEligibility')).toMatchObject({
      supersedes: first.eligibility,
      registrationRevision: 4,
    })
  })

  it('an eligibility from before a recovery is not handed out again: a new one is issued without supersedes', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const first = await f.handoff()!.current(modelRequest)
    if (first.kind !== 'current') throw new Error('fixture: first eligibility')
    // A step commit does not change the registration revision; out-of-order makes the scope recover.
    f.append(A, STEP, step(atA, 's4', NOTES, 1))
    f.faults.outOfOrder = 1
    await f.committed(A, [STEP])
    const second = await f.handoff()!.current(modelRequest)
    if (second.kind !== 'current') throw new Error(`expected current, got ${second.kind}`)
    expect(second.eligibility).not.toEqual(first.eligibility)
    const issues = f.rcCalls.filter(call => call.method === 'issueEligibility')
    expect(issues).toHaveLength(2)
    expect(issues[1]!.input).toMatchObject({ supersedes: null, registrationRevision: 3 })
  })

  it('maps the holder authority refusing the issue to refused', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    f.ports.script(call =>
      call.face === 'holder' && call.action.kind === 'issue' ? { kind: 'refused' } : undefined,
    )
    expect(await f.handoff()!.current(modelRequest)).toEqual({ kind: 'refused' })
  })

  it('a scope the holder has not seen is unavailable, never refused or absent', async () => {
    const f = await assembled()
    const answer = await f.handoff()!.current(modelRequest)
    expect(answer.kind).toBe('unavailable')
  })

  it('without the coordinator principal it is unavailable and reads nothing', async () => {
    const f = await assembled()
    seedA(f)
    f.faults.principal = true
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.sessionCalls).toEqual([])
    expect(f.methods()).toEqual([])
  })
})

// --- Cordis lifecycle ------------------------------------------------------------------------------

describe('on real Cordis', () => {
  it('the holder and replay plugins stay absent while runtimeContext is absent: no handoff, no recovery', async () => {
    const f = await assembled({ mount: ['session'] })
    expect(f.handoff()).toBeUndefined()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    // No recovery, and the replay sub-plugin read nothing: only the facts plugin read the records.
    expect(f.methods()).toEqual([])
    expect(f.replayCalls).toEqual([])
    expect(f.factsHistoryCalls.length).toBeGreaterThan(0)
    // The facts plugin needs `session` alone: it has indexed the scope and answers.
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, null)).toEqual({
      kind: 'known',
      keys: [],
    })
    // The provider arrives: the plugins start, the next notice recovers the scope.
    await mount(f.ctx, f.services.rc)
    expect(f.handoff()).toBeDefined()
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay'])
  })

  it('the three plugins stay absent while session is absent', async () => {
    const f = await assembled({ mount: ['rc'] })
    expect(f.handoff()).toBeUndefined()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.methods()).toEqual([])
    expect(f.sessionCalls).toEqual([])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, null)).toEqual({
      kind: 'unavailable',
    })
  })

  it('a new Runtime Context provider recovers the scope again before the next eligibility', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('current')
    await f.fibers.get('rc')!.dispose()
    expect(f.handoff()).toBeUndefined()
    await mount(f.ctx, f.services.rc)
    const before = f.rcCalls.length
    const answer = await f.handoff()!.current(modelRequest)
    expect(answer.kind).toBe('current')
    // The new instance knows nothing: a fresh recovery (supersedes null) comes before the issue.
    expect(f.methods().slice(before)).toEqual(['beginReplay', 'finishReplay', 'issueEligibility'])
    expect(lastInput(f, 'beginReplay')).toMatchObject({
      supersedes: null,
      through: { commit: 's3' },
    })
  })

  it('a stopped replay sub-plugin no longer listens, and the replay facts still answer from the facts plugin (R2-D29)', async () => {
    const f = await assembled()
    seedA(f)
    await f.replayFiber.dispose()
    await f.committed(A, [REGISTRATION, STEP])
    // No recovery and no apply, and the stopped replay sub-plugin read nothing.
    expect(f.methods()).toEqual([])
    expect(f.replayCalls).toEqual([])
    expect(f.factsHistoryCalls.length).toBeGreaterThan(0)
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, { commit: 's3' })).toEqual({
      kind: 'known',
      keys: [NOTES],
    })
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('unavailable')
  })

  it('a stopped facts plugin no longer listens, and the replay facts and the lookup are unavailable (R2-D29)', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    const held = f.holder.replayFacts
    await f.factsFiber.dispose()
    expect(await held.stepCommittedBlocks(scopeA, null)).toEqual({ kind: 'unavailable' })
    const before = f.factsCalls.length + f.factsHistoryCalls.length
    f.append(A, REGISTRATION, add(atA, 'r4', 'test.later', 3, 'checkpointed'))
    await f.committed(A, [REGISTRATION])
    expect(f.factsCalls.length + f.factsHistoryCalls.length).toBe(before)
  })

  it('a stopped holder plugin withdraws the handoff', async () => {
    const f = await assembled()
    expect(f.handoff()).toBeDefined()
    await f.holderFiber.dispose()
    expect(f.handoff()).toBeUndefined()
  })
})
