// B1-GAP-REPLAY-FACTS-LINK (SC2): the installed `runtimeContextTrust` reads the holder facts per call
// from `sessionReplayFacts`, the service of the facts sub-plugin of row `session-ad03`. A recovery
// that finishes (RC-09) is checked against those facts; with the service absent, stopped or
// throwing, the answer is `unavailable`, never `authorized`.
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Principal } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type ContextBlockKey,
  type HolderAction,
  type HolderDecision,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import type { SessionReplayFacts, StepCommittedBlocks } from '@omne-harness/session-adapters'
import { SessionReplayFactsService } from '@omne-harness/session-cordis-contract/cordis'
import { principalIssuer } from '../../src/entry/principals.ts'
import {
  createRuntimeContextTrustModule,
  entryReplayFacts,
} from '../../src/entry/runtime-context-trust.ts'
import { createSessionScopeSource } from '../../src/entry/session-scope-source.ts'
import { fixtureEnv, fixtureTenant, got, okOf, type FixtureEnv } from './support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')
const KEY = 'test.notes' as ContextBlockKey

function scopeOf(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}
const scope = scopeOf(`session-scope:${'a'.repeat(64)}`)

/** A recovery that finishes; `restored` are the block keys its material carries. */
function finishReplay(tenant: TenantId, restored: readonly ContextBlockKey[]): HolderAction<unknown> {
  return {
    kind: 'finish-replay',
    scope,
    tenant,
    replay: { replay: 'r-1' },
    through: { commit: 'c-1' },
    material: {
      registrations: [],
      checkpoints:
        restored.length === 0
          ? []
          : [
              {
                commit: { commit: 'c-1' },
                step: { step: 's-1' },
                blocks: restored.map(key => ({ key, value: 1, updates: [] as const })),
              },
            ],
      end: null,
    },
    previous: { checkpoint: null, registrationRevision: 0, end: null },
    appliedCommits: [],
  }
}

/** Trusted bindings that assign the scope to session `ses_1` of tenant A. */
const boundScopes = createSessionScopeSource({
  readOwnership: () => ({
    lookup: async () => ({
      kind: 'bound',
      tenant: tenantA,
      session: 'ses_1' as SessionId,
      generation: 'g1',
    }),
  }),
  readPrincipalBindings: () => ({
    read: async input => ({
      ok: {
        kind: 'bound',
        ...input,
        source: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
      },
    }),
  }),
})

/** A stand-in of the facts sub-plugin: provides `sessionReplayFacts` on the root while it runs. */
function factsPlugin(answer: SessionReplayFacts['stepCommittedBlocks'], calls: unknown[] = []) {
  class Facts extends SessionReplayFactsService {
    readonly stepCommittedBlocks: SessionReplayFacts['stepCommittedBlocks'] = (...args) => {
      calls.push(args)
      return answer(...args)
    }
  }
  return { name: 'fixture-session-ad03-facts', apply: (ctx: Context) => void new Facts(ctx) }
}

const known = (...keys: ContextBlockKey[]) => async (): Promise<StepCommittedBlocks> => ({
  kind: 'known',
  keys,
})

type World = Readonly<{
  fixture: FixtureEnv
  acting: (tenant: TenantId) => Principal
  /** Asks one holder decision through the installed service, from a reader fiber. */
  ask(principal: Principal, action: HolderAction<unknown>): Promise<HolderDecision<unknown>>
}>

async function world(): Promise<World> {
  const fixture = fixtureEnv([runtimeContextTrustKey, principalIssuerKey])
  await fixture.install(principalIssuer)
  // The entry is installed before any row, as in `serve`: the facts plugin starts later.
  await fixture.install(createRuntimeContextTrustModule(boundScopes))
  const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'issuer')
  const actor = okOf(issuer.issueSystem({ component: 'session-ad03' }), 'actor')
  const acting = (tenant: TenantId) =>
    okOf(
      issuer.issueActingForTenant({ actor, tenant, work: { owner: 'session', work: 'ses_1' } }),
      'acting',
    )
  const trust = fixture.scopeOf(runtimeContextTrustKey)
  return {
    fixture,
    acting,
    async ask(principal, action) {
      let asked: Promise<HolderDecision<unknown>> | undefined
      const fiber = trust.plugin({
        name: 'probe-reader',
        inject: [runtimeContextTrustKey],
        apply(ctx: Context) {
          asked = got(ctx.get(runtimeContextTrustKey), 'trust').authority.holder(principal, action)
        },
      })
      await fiber
      if (asked === undefined) throw new Error('fixture: the reader did not ask')
      const decision = await asked
      await fiber.dispose()
      return decision
    },
  }
}

describe('the replay facts of the installed runtimeContextTrust (B1-GAP-REPLAY-FACTS-LINK)', () => {
  it('reads the facts of a facts plugin that starts after the entry: an uncovered recovery is replay-incomplete', async () => {
    const { fixture, acting, ask } = await world()
    const calls: unknown[] = []
    await fixture.root.plugin(factsPlugin(known(KEY), calls))
    const principal = acting(tenantA)
    await expect(ask(principal, finishReplay(tenantA, []))).resolves.toEqual({
      kind: 'invalid',
      reason: 'replay-incomplete',
    })
    expect(calls).toEqual([[scope, { commit: 'c-1' }]])
  })

  it('authorizes a recovery whose material covers every block the facts name', async () => {
    const { fixture, acting, ask } = await world()
    await fixture.root.plugin(factsPlugin(known(KEY)))
    const decision = await ask(acting(tenantA), finishReplay(tenantA, [KEY]))
    expect(decision.kind).toBe('authorized')
  })

  it('passes the unknown answer of the facts through; it is not read as covered', async () => {
    const { fixture, acting, ask } = await world()
    await fixture.root.plugin(factsPlugin(async () => ({ kind: 'unknown' })))
    await expect(ask(acting(tenantA), finishReplay(tenantA, [KEY]))).resolves.toEqual({
      kind: 'unknown',
    })
  })

  it('fails closed with no facts plugin: unavailable, not authorized', async () => {
    const { acting, ask } = await world()
    await expect(ask(acting(tenantA), finishReplay(tenantA, [KEY]))).resolves.toEqual({
      kind: 'unavailable',
    })
  })

  it('reads per call: once the facts plugin stops, the next recovery is unavailable', async () => {
    const { fixture, acting, ask } = await world()
    const fiber = fixture.root.plugin(factsPlugin(known(KEY)))
    await fiber
    expect((await ask(acting(tenantA), finishReplay(tenantA, [KEY]))).kind).toBe('authorized')
    await fiber.dispose()
    await expect(ask(acting(tenantA), finishReplay(tenantA, [KEY]))).resolves.toEqual({
      kind: 'unavailable',
    })
  })

  it('a principal of another tenant is refused before the facts are read', async () => {
    const { fixture, acting, ask } = await world()
    const calls: unknown[] = []
    await fixture.root.plugin(factsPlugin(known(KEY), calls))
    await expect(ask(acting(tenantB), finishReplay(tenantA, [KEY]))).resolves.toEqual({
      kind: 'refused',
    })
    expect(calls).toEqual([])
  })
})

describe('entryReplayFacts', () => {
  it('answers unavailable when the reader finds nothing, the reader throws or the facts throw', async () => {
    const absent = entryReplayFacts(() => undefined)
    const readerThrows = entryReplayFacts(() => {
      throw new Error('secret')
    })
    const factsThrow = entryReplayFacts(() => ({
      stepCommittedBlocks: () => Promise.reject(new Error('secret')),
    }))
    for (const port of [absent, readerThrows, factsThrow])
      await expect(port.stepCommittedBlocks(scope, null)).resolves.toEqual({ kind: 'unavailable' })
    expect(absent.diagnostic).toContain('session-ad03')
    expect(absent.diagnostic).toContain('sessionReplayFacts')
  })

  it('returns the answer of the facts present at the call', async () => {
    let current: SessionReplayFacts | undefined
    const port = entryReplayFacts(() => current)
    await expect(port.stepCommittedBlocks(scope, null)).resolves.toEqual({ kind: 'unavailable' })
    current = { stepCommittedBlocks: known(KEY) }
    await expect(port.stepCommittedBlocks(scope, null)).resolves.toEqual({
      kind: 'known',
      keys: [KEY],
    })
  })
})
