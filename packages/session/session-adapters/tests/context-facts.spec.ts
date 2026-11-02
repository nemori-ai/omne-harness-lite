// R2-D14, R2-D29: the facts plugin `session-ad03-facts` of AD-03 on real Cordis, with the memory
// session of this member behind a scripted Session service. What is checked: a scope that a
// committed notice showed and that the session snapshot lists is `known` with the tenant, session
// and generation of that snapshot; a forged scope text, and a scope that the log of another session
// names, are `unknown` and never another tenant's; a scope the plugin has not seen since it started
// is `unknown`; a failed read, a missing coordinator principal, a missing `session` and a stopped
// plugin are `unavailable`; a scope of an older generation keeps its own generation after the
// snapshot has moved on; `replayFacts` answers without the replay sub-plugin. The lookup names an
// owner and grants nothing.
//
// The translation from a Session entry to a Runtime Context commit input is a scripted double
// (AD-12's translation protocol is not delivered): an entry of a scripted kind names the scope the
// test gives it.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  SessionAccess,
  SessionFaces,
  SessionId,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
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

type Call = Readonly<{ method: string; caller: unknown; principal: unknown }>
type Faults = {
  /** `readWork` answers `unavailable`. */
  work: boolean
  /** The coordinator principal is not available. */
  principal: boolean
  /** The history read answers `unavailable`. */
  history: boolean
  /** The `readWork` answer gets this `contextScopes` value. */
  scopes?: WorkSnapshot['contextScopes']
  /** The `readWork` answer names another session than the one asked. */
  answers?: string
}

let worlds = 0

/**
 * A memory session with one scope, a Session service over it that records every call with its
 * caller class and principal, and the facts plugin. `entryScopes` says which scope an entry kind
 * records; the test changes it before the notice.
 */
async function world(options: Readonly<{ mount?: readonly 'session'[] }> = {}) {
  const s = await scene(`context-facts-${++worlds}`)
  const port = s.backend.transactions
  const snapshot = ok(await port.readWork(s.access))
  const own = snapshot.contextScopes?.[0]
  if (own === undefined) throw new Error('fixture: the memory session has no scope')
  const ownScope = scopeRef(own.scope)

  const faults: Faults = { work: false, principal: false, history: false }
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
          calls.push({ method: 'history.begin', caller, principal: input.principal })
          return faults.history
            ? fail({ kind: 'unavailable', owner: 'session', diagnostic: 'history down' })
            : faced.begin(input)
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
          if (faults.work)
            return fail({ kind: 'unavailable', owner: 'session', diagnostic: 'work down' })
          const answer = await (port as unknown as SessionFaces<unknown>['work']).readWork(input)
          if (!('ok' in answer)) return answer
          return {
            ok: {
              ...answer.ok,
              ...(faults.scopes === undefined ? {} : { contextScopes: faults.scopes }),
              ...(faults.answers === undefined ? {} : { session: faults.answers as SessionId }),
            },
          }
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

  /** Dispatches the committed notice of the session, as the session provider does. */
  const committed = (kinds: readonly string[] = [CREATED, ADOPTION]) =>
    ctx.parallel(
      'session-cordis-contract/committed',
      s.access.tenant,
      s.access.session as SessionId,
      '2' as SessionRevision,
      evidence('batch-2'),
      kinds,
    )

  return { s, ctx, holder, facts, faults, calls, entryScopes, ownScope, own, committed }
}

describe('R2-D14 the scope lookup of the facts plugin', () => {
  it('R2-D14 a scope that the notice showed and the snapshot lists is known with the generation of the snapshot', async () => {
    const f = await world()
    await f.committed()
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({
      kind: 'known',
      tenant: f.s.access.tenant,
      session: f.s.access.session,
      generation: f.own.generation,
    })
  })

  it('R2-D29 a known answer names an owner and nothing else, and its reads come from the coordinator class with the principal of the session', async () => {
    const f = await world()
    await f.committed()
    const answer = await f.holder.scopeLookup.lookup(f.ownScope)
    expect(Object.keys(answer).sort()).toEqual(['generation', 'kind', 'session', 'tenant'])
    expect(f.calls.length).toBeGreaterThan(0)
    expect(
      f.calls.every(
        call =>
          (call.caller as { caller?: unknown }).caller === 'coordinator' &&
          call.principal === f.s.access.principal,
      ),
    ).toBe(true)
    expect(f.calls.map(call => call.method)).toContain('work.readWork')
  })

  it('R2-D14 a forged scope text is unknown', async () => {
    const f = await world()
    await f.committed()
    expect(await f.holder.scopeLookup.lookup(scopeRef('session-scope:forged'))).toEqual({
      kind: 'unknown',
    })
  })

  it('R2-D14 a scope of another tenant that a session log names is unknown, never the tenant of that log', async () => {
    const foreign = await scene('context-facts-foreign', undefined, undefined, undefined, 'other')
    const theirs = ok(await foreign.backend.transactions.readWork(foreign.access))
      .contextScopes?.[0]
    if (theirs === undefined) throw new Error('fixture: the foreign session has no scope')
    const foreignScope = scopeRef(theirs.scope)

    const f = await world()
    // The records of this session name a scope that its own snapshot does not list.
    f.entryScopes[ADOPTION] = foreignScope
    await f.committed()

    expect(await f.holder.scopeLookup.lookup(foreignScope)).toEqual({ kind: 'unknown' })
    // The scope the snapshot does list is still answered for its own session.
    expect((await f.holder.scopeLookup.lookup(f.ownScope)).kind).toBe('known')
  })

  it('R2-D14 a scope that the snapshot no longer lists is unknown', async () => {
    const f = await world()
    await f.committed()
    f.faults.scopes = []
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unknown' })
  })

  it('R2-D14 a scope not seen since the plugin started is unknown, not absent from the store', async () => {
    const f = await world()
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unknown' })
    expect(f.calls).toEqual([])
  })

  it('R2-D14 a notice still in flight is waited for before a scope is called unknown', async () => {
    const f = await world()
    const dispatched = f.committed()
    const answer = await f.holder.scopeLookup.lookup(f.ownScope)
    await dispatched
    expect(answer.kind).toBe('known')
  })

  it('R2-D14 a notice whose kinds hold no context record indexes nothing', async () => {
    const f = await world()
    await f.committed(['run.terminal'])
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unknown' })
    expect(f.calls).toEqual([])
  })

  it('R2-D14 a scope of an older generation keeps its own generation after the snapshot moved on', async () => {
    const f = await world()
    const next = scopeRef('session-scope:second-generation')
    f.entryScopes[ADOPTION] = next
    f.faults.scopes = [
      { ...f.own, ended: evidence('archived') },
      { generation: '2', scope: next.ref, operation: operationId('unarchive'), ended: null },
    ]
    await f.committed()

    const old = await f.holder.scopeLookup.lookup(f.ownScope)
    expect(old).toMatchObject({ kind: 'known', generation: f.own.generation })
    // An ended scope still names its owner; the answer does not say it is live.
    expect(await f.holder.scopeLookup.lookup(next)).toMatchObject({
      kind: 'known',
      generation: '2',
    })
  })
})

describe('R2-D14 unknown and unavailable stay apart', () => {
  it('R2-D14 a failed snapshot read is unavailable, and the same scope is known once the read works', async () => {
    const f = await world()
    await f.committed()
    f.faults.work = true
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
    f.faults.work = false
    expect((await f.holder.scopeLookup.lookup(f.ownScope)).kind).toBe('known')
  })

  it('R2-D14 a coordinator principal that cannot be had is unavailable', async () => {
    const f = await world()
    await f.committed()
    f.faults.principal = true
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })

  it('R2-D14 a snapshot that answers another session than the one asked is unavailable, not known', async () => {
    const f = await world()
    await f.committed()
    f.faults.answers = 'another-session'
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })

  it('R2-D14 a stopped facts plugin answers unavailable to a caller that holds the old reference', async () => {
    const f = await world()
    await f.committed()
    const held = f.holder.scopeLookup
    await f.facts.dispose()
    expect(await held.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })

  it('R2-D14 a missing session service keeps the plugin pending and the lookup unavailable', async () => {
    const f = await world({ mount: [] })
    expect(await f.holder.scopeLookup.lookup(f.ownScope)).toEqual({ kind: 'unavailable' })
  })
})

describe('R2-D14 replayFacts without the replay sub-plugin', () => {
  it('R2-D14 answers from the facts plugin while no replay sub-plugin and no Runtime Context run', async () => {
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

  it('R2-D14 replayFacts is unavailable for a scope the plugin has not seen, a history that cannot be read, and a stopped plugin', async () => {
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
