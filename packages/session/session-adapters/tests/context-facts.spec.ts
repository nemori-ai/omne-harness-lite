import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import type { JsonValue } from '@omne-harness/json-text'
import {
  CONTEXT_SCOPE_KINDS,
  contextScopeOf,
  type EntryId,
  type HistoryEntry,
  type SessionAccess,
  type SessionFaces,
  type SessionId,
  type SessionRevision,
} from '@omne-harness/session-contract'
import { adoption, evidence, operationId } from '@omne-harness/session-contract/testing'
import {
  SessionReplayFactsService,
  SessionScopeLookupService,
  SessionService,
  sessionReplayFactsKey,
  sessionScopeLookupKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createSessionContextHolder,
  type SessionContextTranslation,
} from '../src/cordis/context-holder.ts'
import { ok, scene } from './fixtures/common-journal.ts'

function scopeRef(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error(`fixture: scope ${ref}`)
  return decoded.ok
}

const CREATED = 'session.created'
const ADOPTION = 'session.adoption'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

type Call = Readonly<{
  method: string
  caller: unknown
  principal: unknown
  kinds?: readonly string[]
}>
type Faults = {
  principal: boolean
  history: boolean
  scopes: boolean
  extra?: HistoryEntry
}

const isScopeRead = (kinds: readonly string[] | undefined) =>
  kinds !== undefined &&
  kinds.length > 0 &&
  kinds.every(kind => (CONTEXT_SCOPE_KINDS as readonly string[]).includes(kind))

function tree(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: tree(item),
    })),
  }
}

let worlds = 0

async function world(options: Readonly<{ mount?: readonly 'session'[] }> = {}) {
  const s = await scene(`context-facts-${++worlds}`)
  const port = s.backend.transactions
  const snapshot = ok(await port.readWork(s.access))
  const own = snapshot.contextScopes?.[0]
  if (own === undefined) throw new Error('fixture: the memory session has no scope')
  const ownScope = scopeRef(own.scope)

  const faults: Faults = { principal: false, history: false, scopes: false }
  const calls: Call[] = []
  const entryScopes: Record<string, ScopeRef> = { [CREATED]: ownScope }

  const translation: SessionContextTranslation = {
    kinds: [CREATED, ADOPTION],
    commitOf: entry => {
      const scope = entryScopes[entry.kind]
      return succeed(
        scope === undefined
          ? null
          : {
              kind: 'scope',
              commit: { commit: entry.id },
              scope,
              tenant: s.access.tenant,
              scopeEnded: true,
            },
      )
    },
  }
  const holder = createSessionContextHolder<unknown>({
    coordinator: async () =>
      faults.principal
        ? fail({ kind: 'unavailable', owner: 'test', diagnostic: 'down' })
        : succeed(s.access.principal),
    translation,
  })

  class Session extends SessionService<unknown> {
    get history(): SessionFaces<unknown>['history'] {
      const caller = this[Service.resolveConfig]()
      const faced = port.history as unknown as SessionFaces<unknown>['history']
      return {
        ...faced,
        begin: async input => {
          calls.push({
            method: 'history.begin',
            caller,
            principal: input.principal,
            kinds: input.kinds,
          })
          if (faults.history || (faults.scopes && isScopeRead(input.kinds)))
            return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'history down' })
          const page = await faced.begin(input)
          const extra = faults.extra
          if (!('ok' in page) || extra === undefined || !input.kinds.includes(extra.kind))
            return page
          return { ok: { ...page.ok, entries: [...page.ok.entries, extra] } }
        },
        next: input => {
          calls.push({ method: 'history.next', caller, principal: input.principal })
          return faced.next(input)
        },
      }
    }
    get work(): SessionFaces<unknown>['work'] {
      const caller = this[Service.resolveConfig]()
      return {
        readWork: async (input: SessionAccess<unknown>) => {
          calls.push({ method: 'work.readWork', caller, principal: input.principal })
          return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'no snapshot served' })
        },
      } as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
  }

  const ctx = new Context()
  const fibers = new Map<string, Awaited<ReturnType<Context['plugin']>>>()
  for (const name of options.mount ?? (['session'] as const))
    fibers.set(name, await mount(ctx, Session))
  const facts = await mount(ctx, holder.facts)

  const committed = (kinds: readonly string[] = [CREATED, ADOPTION]) =>
    ctx.parallel(
      'session-cordis-contract/committed',
      s.access.tenant,
      s.access.session as SessionId,
      '2' as SessionRevision,
      evidence('batch-2'),
      kinds,
    )

  const lookup = (scope: ScopeRef) =>
    ctx[sessionScopeLookupKey]?.lookup(scope) ?? Promise.resolve({ kind: 'unavailable' } as const)

  const cycle = async (name: string) => {
    for (const kind of ['archive', 'unarchive'] as const)
      ok(
        await port.commit({
          access: s.access,
          command: {
            kind: 'control',
            input: { ...s.access, operation: operationId(`${kind}-${name}`), intent: { kind } },
          },
          guards: [],
        }),
      )
    const latest = ok(await port.readWork(s.access)).contextScopes?.at(-1)
    if (latest === undefined) throw new Error('fixture: no new generation')
    return { scope: scopeRef(latest.scope), generation: latest.generation }
  }

  const scopeReads = () =>
    calls.filter(
      call =>
        call.method === 'history.begin' &&
        JSON.stringify(call.kinds) === JSON.stringify(['session.archived']),
    ).length

  return {
    s,
    ctx,
    holder,
    facts,
    faults,
    calls,
    entryScopes,
    ownScope,
    own,
    committed,
    lookup,
    cycle,
    scopeReads,
  }
}

describe('the scope lookup of the facts plugin', () => {
  it('a scope that the notice showed and the bindings list is known with the generation of the bindings', async () => {
    const f = await world()
    await f.committed()
    expect(await f.lookup(f.ownScope)).toEqual({
      kind: 'known',
      tenant: f.s.access.tenant,
      session: f.s.access.session,
      generation: f.own.generation,
    })
  })

  it('a known answer names an owner and nothing else; every read is a history read as reader with the principal of the session, none reads the snapshot', async () => {
    const f = await world()
    await f.committed()
    const answer = await f.lookup(f.ownScope)
    expect(Object.keys(answer).sort()).toEqual(['generation', 'kind', 'session', 'tenant'])
    expect(f.calls.length).toBeGreaterThan(0)
    const classOf = (call: (typeof f.calls)[number]) => (call.caller as { caller?: unknown }).caller
    expect(f.calls.every(call => call.principal === f.s.access.principal)).toBe(true)
    expect(f.calls.every(call => classOf(call) === 'reader')).toBe(true)
    expect(f.calls.map(call => call.method)).not.toContain('work.readWork')
    expect(f.calls.map(call => call.method)).toContain('history.begin')
    expect(
      f.calls.filter(call => isScopeRead(call.kinds)).every(call => call.kinds?.length === 1),
    ).toBe(true)
  })

  it('a forged scope text is unknown', async () => {
    const f = await world()
    await f.committed()
    expect(await f.lookup(scopeRef('session-scope:forged'))).toEqual({
      kind: 'unknown',
    })
  })

  it('a scope of another tenant that a session log names is unknown, never the tenant of that log', async () => {
    const foreign = await scene('context-facts-foreign', undefined, undefined, undefined, 'other')
    const theirs = ok(await foreign.backend.transactions.readWork(foreign.access))
      .contextScopes?.[0]
    if (theirs === undefined) throw new Error('fixture: the foreign session has no scope')
    const foreignScope = scopeRef(theirs.scope)

    const f = await world()
    f.entryScopes[ADOPTION] = foreignScope
    await f.committed()

    expect(await f.lookup(foreignScope)).toEqual({ kind: 'unknown' })
    expect((await f.lookup(f.ownScope)).kind).toBe('known')
  })

  it('a generation the session has not minted yet is unknown, and known once it is minted', async () => {
    const f = await world()
    const second = scopeRef(
      contextScopeOf({ tenant: f.s.access.tenant, session: f.s.access.session, generation: '2' }),
    )
    f.entryScopes[ADOPTION] = second
    await f.committed()
    expect(await f.lookup(second)).toEqual({ kind: 'unknown' })
    expect(await f.cycle('second')).toEqual({ scope: second, generation: '2' })
    expect(await f.lookup(second)).toEqual({
      kind: 'known',
      tenant: f.s.access.tenant,
      session: f.s.access.session,
      generation: '2',
    })
  })

  it('a scope not seen since the plugin started is unknown, not absent from the store', async () => {
    const f = await world()
    expect(await f.lookup(f.ownScope)).toEqual({ kind: 'unknown' })
    expect(f.calls).toEqual([])
  })

  it('a notice still in flight is waited for before a scope is called unknown', async () => {
    const f = await world()
    const dispatched = f.committed()
    const answer = await f.lookup(f.ownScope)
    await dispatched
    expect(answer.kind).toBe('known')
  })

  it('the first notice of a session indexes its open scope without reading the context records, and a later one reads nothing', async () => {
    const f = await world()
    await f.committed(['run.terminal'])
    expect(await f.lookup(f.ownScope)).toMatchObject({ kind: 'known' })
    const before = f.calls.length
    expect(f.calls.every(call => isScopeRead(call.kinds) || call.method === 'history.next')).toBe(
      true,
    )
    await f.committed(['run.terminal'])
    expect(f.calls).toHaveLength(before)
  })

  it('a scope of an older generation keeps its own generation after the session moved on', async () => {
    const f = await world()
    const { scope: next } = await f.cycle('older')
    await f.committed([CREATED, ADOPTION, 'session.unarchived'])

    const old = await f.lookup(f.ownScope)
    expect(old).toMatchObject({ kind: 'known', generation: f.own.generation })
    expect(await f.lookup(next)).toMatchObject({
      kind: 'known',
      generation: '2',
    })
  })
})

describe('unknown and unavailable stay apart', () => {
  it('a failed scope read is unavailable, and the same scope is known once the read works', async () => {
    const f = await world()
    f.faults.scopes = true
    await f.committed()
    expect(await f.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
    f.faults.scopes = false
    expect((await f.lookup(f.ownScope)).kind).toBe('known')
  })

  it('a coordinator principal that cannot be had is unavailable', async () => {
    const f = await world()
    f.faults.scopes = true
    await f.committed()
    f.faults.scopes = false
    f.faults.principal = true
    expect(await f.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })

  it('a binding that is not minted for the session asked is unavailable, not known', async () => {
    const f = await world()
    f.faults.extra = {
      id: 'entry-elsewhere' as EntryId,
      revision: '9' as SessionRevision,
      kind: 'session.unarchived',
      schema: adoption('test-entry'),
      payload: tree({
        scope: {
          generation: '2',
          scope: contextScopeOf({
            tenant: f.s.access.tenant,
            session: 'another-session' as SessionId,
            generation: '2',
          }),
          operation: 'op-elsewhere',
          ended: null,
        },
      }),
      origin: { owner: 'session', via: null, source: evidence('elsewhere') },
    }
    await f.committed()
    expect(await f.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })

  it('a missing session service keeps the plugin pending: no service, and the lookup is unavailable', async () => {
    const f = await world({ mount: [] })
    expect(f.ctx[sessionScopeLookupKey]).toBeUndefined()
    expect(f.ctx[sessionReplayFactsKey]).toBeUndefined()
    expect(await f.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })
})

describe('SCOPE-NARROW the owner of a scope never changes', () => {
  it('a known answer is read from the store once, however often it is asked', async () => {
    const f = await world()
    await f.committed()
    for (let at = 0; at < 4; at++)
      expect(await f.lookup(f.ownScope)).toMatchObject({ kind: 'known', generation: '1' })
    expect(f.scopeReads()).toBe(1)
  })

  it('a known answer stays the owner after the scope ended: the end is no part of it', async () => {
    const f = await world()
    await f.committed()
    const before = await f.lookup(f.ownScope)
    await f.cycle('ended')
    expect(await f.lookup(f.ownScope)).toEqual(before)
  })
})

describe('the two facts services on real Cordis', () => {
  it('sessionScopeLookup and sessionReplayFacts are provided under their keys while the facts plugin runs', async () => {
    const f = await world()
    await f.committed()
    expect(f.ctx[sessionScopeLookupKey]).toBeInstanceOf(SessionScopeLookupService)
    expect(f.ctx[sessionReplayFactsKey]).toBeInstanceOf(SessionReplayFactsService)
    expect((await f.ctx[sessionScopeLookupKey].lookup(f.ownScope)).kind).toBe('known')
    expect(await f.ctx[sessionReplayFactsKey].stepCommittedBlocks(f.ownScope, null)).toEqual({
      kind: 'known',
      keys: [],
    })
  })

  it('a stopped facts plugin withdraws both services, and a caller that holds the old reference gets unavailable', async () => {
    const f = await world()
    await f.committed()
    const heldLookup = f.ctx[sessionScopeLookupKey]
    const heldFacts = f.ctx[sessionReplayFactsKey]
    expect((await heldLookup.lookup(f.ownScope)).kind).toBe('known')

    await f.facts.dispose()

    expect(f.ctx[sessionScopeLookupKey]).toBeUndefined()
    expect(f.ctx[sessionReplayFactsKey]).toBeUndefined()
    expect(await heldLookup.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
    expect(await heldFacts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'unavailable' })
  })
})

describe('replayFacts without the replay sub-plugin', () => {
  it('answers from the facts plugin while no replay sub-plugin and no Runtime Context run', async () => {
    const f = await world()
    await f.committed()
    const facts = f.holder.replayFacts
    expect(await facts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'known', keys: [] })
    expect(await facts.stepCommittedBlocks(f.ownScope, { commit: '1' })).toEqual({
      kind: 'known',
      keys: [],
    })
    expect(await facts.stepCommittedBlocks(f.ownScope, { commit: 'gone' })).toEqual({
      kind: 'unknown',
    })
  })

  it('replayFacts is unavailable for a scope the plugin has not seen, a history that cannot be read, and a stopped plugin', async () => {
    const f = await world()
    const facts = f.holder.replayFacts
    expect(await facts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'unavailable' })
    await f.committed()
    f.faults.history = true
    expect(await facts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'unavailable' })
    f.faults.history = false
    expect(await facts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'known', keys: [] })
    await f.facts.dispose()
    expect(await facts.stepCommittedBlocks(f.ownScope, null)).toEqual({ kind: 'unavailable' })
  })
})
