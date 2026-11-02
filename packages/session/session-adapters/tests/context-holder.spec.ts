// AD-03 on real Cordis: the Runtime Context holder of Session. What is checked: the replay
// sub-plugin reads the session's context records with the `reader` caller class and is the only
// caller of `applyCommit`; a scope it has not recovered starts a recovery session whose material
// holds the registrations in log order, the checkpointed blocks that have a step commit (and no
// other block), and the end; `out-of-order` starts a recovery session that supersedes the current
// one; `replayFacts.stepCommittedBlocks` reads the same records and makes C18's trust refuse a
// finish that leaves out a step-committed block; the `runtimeContextReaderEligibility` provider
// passes the handoff suite, refuses another tenant before it reads anything, and issues per
// consumer class; both plugins stay absent while a dependency is absent, and a new Runtime Context
// provider makes the scope recover again before the next eligibility.
//
// Runtime Context is the contract's memory double behind a Cordis service, with C18's trust built
// from the test authority ports and the holder's own `replayFacts`. The translation from a Session
// entry to a Runtime Context commit input is a scripted double: its real provider is AD-12's
// translation protocol, which is not delivered yet.
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

const sessionKey = (access: { tenant: TenantId; session: SessionId }) =>
  JSON.stringify([textOf(access.tenant), access.session])

/**
 * A real Cordis root with a memory Runtime Context behind its service, a session service that
 * serves the history face from a per-session log (pages of two entries, only to the coordinator
 * principal of that session), and the two AD-03 plugins.
 */
async function assembled(options: { mount?: readonly ('rc' | 'session')[] } = {}) {
  const ctx = new Context()
  const logged: { name: string; type: string }[] = []
  ctx.logger.exporter({
    export: message => logged.push({ name: message.name, type: message.type }),
  })
  const faults = { outOfOrder: 0, finish: 0, history: false, principal: false, incomplete: false }
  const rcCalls: Call[] = []
  const historyCalls: Call[] = []
  const callers: unknown[] = []
  const principalsAsked: unknown[] = []

  // The session log: entries per session and the commit input each entry records.
  const logs = new Map<string, HistoryEntry[]>()
  const inputs = new Map<string, CommitInput | null>()
  let serial = 0
  /** `undefined` leaves the entry without a scripted input, so its translation fails. */
  function append(access: SessionAccess<unknown>, kind: string, input?: CommitInput | null) {
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
    commitOf: entry => {
      const input = inputs.get(entry.id)
      return input === undefined ? fail('no commit input scripted for this entry') : succeed(input)
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
  const historyFace: SessionFaces<unknown>['history'] = {
    begin: async input => {
      historyCalls.push({ method: 'begin', input })
      if (!owns(input)) return fail({ kind: 'denied', action: 'history.begin' })
      if (faults.history)
        return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'history down' })
      return succeed(page(sessionKey(input), input.kinds, 0))
    },
    next: async input => {
      historyCalls.push({ method: 'next', input })
      if (!owns(input)) return fail({ kind: 'denied', action: 'history.next' })
      const [key, kinds, offset] = JSON.parse(input.cursor) as [string, string[], number]
      if (key !== sessionKey(input)) return fail({ kind: 'denied', action: 'history.next' })
      return succeed(page(key, kinds, offset))
    },
    since: async () => fail({ kind: 'unavailable', owner: 'session', diagnostic: 'not used' }),
    readModelView: async () =>
      fail({ kind: 'unavailable', owner: 'session', diagnostic: 'not used' }),
  }
  class Session extends SessionService<unknown> {
    get history(): SessionFaces<unknown>['history'] {
      callers.push(this[Service.resolveConfig]())
      return historyFace
    }
    readonly work = {} as SessionFaces<unknown>['work']
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
  }

  const services = { rc: RuntimeContext, session: Session } as const
  const fibers = new Map<string, Awaited<ReturnType<Context['plugin']>>>()
  for (const name of options.mount ?? (['rc', 'session'] as const))
    fibers.set(name, await mount(ctx, services[name]))
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
    replayFiber,
    holderFiber,
    rcCalls,
    historyCalls,
    callers,
    principalsAsked,
    append,
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
    // Every read of `session` went through the reader caller class.
    expect(f.callers.length).toBeGreaterThan(0)
    expect(f.callers.every(caller => (caller as { caller?: unknown }).caller === 'reader')).toBe(
      true,
    )
    expect(f.historyCalls.map(call => call.method)).toContain('next')
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
    expect(f.historyCalls).toEqual([])
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
    const reads = f.historyCalls.length
    const issued = f.methods().length
    expect(await f.handoff()!.current({ ...modelRequest, tenant: B.tenant })).toEqual({
      kind: 'refused',
    })
    expect(f.historyCalls.length).toBe(reads)
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

  it('answers absent for a consumer class that the registrations give nothing to read', async () => {
    const f = await assembled()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(await f.handoff()!.current({ ...modelRequest, consumer: 'extension' })).toEqual({
      kind: 'absent',
    })
    expect(f.methods().filter(method => method === 'issueEligibility')).toEqual([])
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
    expect(f.historyCalls).toEqual([])
    expect(f.methods()).toEqual([])
  })
})

// --- Cordis lifecycle ------------------------------------------------------------------------------

describe('on real Cordis', () => {
  it('both plugins stay absent while runtimeContext is absent: no handoff, no recovery', async () => {
    const f = await assembled({ mount: ['session'] })
    expect(f.handoff()).toBeUndefined()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.historyCalls).toEqual([])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, null)).toEqual({
      kind: 'unavailable',
    })
    // The provider arrives: the plugins start, the next notice recovers the scope.
    await mount(f.ctx, f.services.rc)
    expect(f.handoff()).toBeDefined()
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.methods()).toEqual(['beginReplay', 'finishReplay'])
  })

  it('both plugins stay absent while session is absent', async () => {
    const f = await assembled({ mount: ['rc'] })
    expect(f.handoff()).toBeUndefined()
    seedA(f)
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.methods()).toEqual([])
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

  it('a stopped replay sub-plugin no longer listens and its facts are unavailable', async () => {
    const f = await assembled()
    seedA(f)
    await f.replayFiber.dispose()
    await f.committed(A, [REGISTRATION, STEP])
    expect(f.historyCalls).toEqual([])
    expect(await f.holder.replayFacts.stepCommittedBlocks(scopeA, null)).toEqual({
      kind: 'unavailable',
    })
    expect((await f.handoff()!.current(modelRequest)).kind).toBe('unavailable')
  })

  it('a stopped holder plugin withdraws the handoff', async () => {
    const f = await assembled()
    expect(f.handoff()).toBeDefined()
    await f.holderFiber.dispose()
    expect(f.handoff()).toBeUndefined()
  })
})
