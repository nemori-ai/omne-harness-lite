import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  ContextBlockKey,
  FinishReplayAction,
  HolderDecision,
  ReplayMaterial,
  RuntimeContextAuthority,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  createTestAuthorityPorts,
  runConformanceCase,
  runtimeContextTrustConformance,
} from '@omne-harness/runtime-context-contract/testing'
import type {
  RuntimeContextTrustControls,
  RuntimeContextTrustFixture,
} from '@omne-harness/runtime-context-contract/testing'
import {
  createSessionRuntimeContextTrust,
  type RuntimeContextCurrentBridge,
  type SessionReplayFacts,
  type StepCommittedBlocks,
} from '../src/runtime-context-trust.ts'

const first = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
const second = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!first.ok || !second.ok) throw new Error('Invalid fixture tenant')
const tenant = first.value
const otherTenant = second.value
const principal = 'suite'

function scopeOf(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}
const target = scopeOf('session-scope')

type Face = 'holder' | 'producer' | 'reader'
const sourceFaces = {
  revokeAuthorization: ['holder', 'producer', 'reader'],
  revokeWork: ['holder', 'reader'],
  advanceRequestGeneration: ['producer', 'reader'],
  advanceBridgeGeneration: ['holder', 'producer', 'reader'],
} as const satisfies Record<keyof RuntimeContextTrustControls, readonly Face[]>

/** A test bridge: one monotonic generation per source, a captured view watches the sources its face depends on. */
function generations() {
  const sources = Object.keys(sourceFaces) as (keyof typeof sourceFaces)[]
  const current = Object.fromEntries(sources.map(source => [source, 0])) as Record<
    keyof typeof sourceFaces,
    number
  >
  const bridgeFor = (face: Face): RuntimeContextCurrentBridge => ({
    capture() {
      const seen = { ...current }
      const watched = sources.filter(source =>
        (sourceFaces[source] as readonly Face[]).includes(face),
      )
      return { current: () => watched.every(source => seen[source] === current[source]) }
    },
  })
  const controls: RuntimeContextTrustControls = {
    revokeAuthorization: () => void current.revokeAuthorization++,
    revokeWork: () => void current.revokeWork++,
    advanceRequestGeneration: () => void current.advanceRequestGeneration++,
    advanceBridgeGeneration: () => void current.advanceBridgeGeneration++,
  }
  return { bridgeFor, controls }
}

const noStepCommits: SessionReplayFacts = {
  async stepCommittedBlocks() {
    return { kind: 'known', keys: [] }
  },
}

describe('the trust satisfies the Runtime Context trust conformance suite', () => {
  // A per-face bridge is wired through three instances of the factory, one per authority face.
  const fixture: RuntimeContextTrustFixture<string> = {
    tenant,
    otherTenant,
    principal,
    create({ authority, bindings }) {
      const { bridgeFor, controls } = generations()
      const built = (face: Face) =>
        createSessionRuntimeContextTrust<string>({
          authority,
          bindings,
          current: bridgeFor(face),
          replayFacts: noStepCommits,
        })
      const holder = built('holder')
      const producer = built('producer')
      const reader = built('reader')
      return {
        trust: {
          bindings: holder.bindings,
          authority: {
            holder: (who, action) => holder.authority.holder(who, action),
            producer: (who, action) => producer.authority.producer(who, action),
            reader: (who, eligibility) => reader.authority.reader(who, eligibility),
          },
        },
        controls,
      }
    },
  }
  for (const c of runtimeContextTrustConformance<string>())
    it(c.name, async () => {
      // The known gap (#677) has no fixture that passes it; every other case passes.
      expect(await runConformanceCase(c, fixture)).toEqual(
        c.name === 'async-notification-pending-revoked'
          ? { kind: 'not-applicable', handle: 'synchronous revocation source (known gap #677)' }
          : { kind: 'passed' },
      )
    })
})

function material(keys: readonly ContextBlockKey[]): ReplayMaterial {
  return {
    registrations: [],
    checkpoints: keys.length
      ? [
          {
            commit: { commit: 'c1' },
            step: { step: 's1' },
            blocks: keys.map(key => ({ key, value: 1, updates: [] as const })),
          },
        ]
      : [],
    end: null,
  }
}
function finish(built: ReplayMaterial): FinishReplayAction {
  return {
    kind: 'finish-replay',
    scope: target,
    tenant,
    replay: { replay: 'r1' },
    through: { commit: 'c1' },
    material: built,
    previous: { checkpoint: null, registrationRevision: 1, end: null },
    appliedCommits: [],
  }
}

/** The original ports of the test plus a facts port that records every ask. */
function holder(answer: StepCommittedBlocks = { kind: 'known', keys: [] }) {
  const ports = createTestAuthorityPorts<string>()
  ports.bind(target, tenant)
  const asked: { scope: ScopeRef; through: unknown }[] = []
  const generation = generations()
  const replayFacts: SessionReplayFacts = {
    async stepCommittedBlocks(scope, through) {
      asked.push({ scope, through })
      return answer
    },
  }
  const trust = createSessionRuntimeContextTrust<string>({
    authority: ports.authority,
    bindings: ports.bindings,
    current: generation.bridgeFor('holder'),
    replayFacts,
  })
  return { ports, trust, asked, ...generation }
}

describe('finishing a recovery: the holder authority covers every block that has a step commit', () => {
  it('answers replay-incomplete when the material leaves out a block that has a step commit', async () => {
    const h = holder({ kind: 'known', keys: ['suite.a', 'suite.b'] })
    const decision = await h.trust.authority.holder(principal, finish(material(['suite.a'])))
    expect(decision).toEqual({ kind: 'invalid', reason: 'replay-incomplete' })
    expect(h.asked).toEqual([{ scope: target, through: { commit: 'c1' } }])
  })

  it('accepts material that leaves out a block that has no step commit yet', async () => {
    // suite.b is registered but never step-committed, so the holder facts do not list it.
    const h = holder({ kind: 'known', keys: ['suite.a'] })
    const decision = await h.trust.authority.holder(principal, finish(material(['suite.a'])))
    expect(decision.kind).toBe('authorized')
    if (decision.kind === 'authorized') expect(decision.current()).toBe(true)
  })

  it('accepts empty material for a scope without step commits', async () => {
    const h = holder()
    expect((await h.trust.authority.holder(principal, finish(material([])))).kind).toBe(
      'authorized',
    )
  })

  it('does not take extra material blocks for coverage of a missing one', async () => {
    const h = holder({ kind: 'known', keys: ['suite.a'] })
    const decision = await h.trust.authority.holder(
      principal,
      finish(material(['suite.b', 'suite.c'])),
    )
    expect(decision).toEqual({ kind: 'invalid', reason: 'replay-incomplete' })
  })

  it('reports facts that cannot be read as unavailable or unknown, never as complete', async () => {
    for (const kind of ['unavailable', 'unknown'] as const) {
      const h = holder({ kind })
      expect(await h.trust.authority.holder(principal, finish(material([])))).toEqual({ kind })
    }
  })

  it('does not disclose an incomplete verdict to an answer that went stale while facts were read', async () => {
    const ports = createTestAuthorityPorts<string>()
    ports.bind(target, tenant)
    const generation = generations()
    let release: (answer: StepCommittedBlocks) => void = () => undefined
    let entered = false
    const trust = createSessionRuntimeContextTrust<string>({
      authority: ports.authority,
      bindings: ports.bindings,
      current: generation.bridgeFor('holder'),
      replayFacts: {
        stepCommittedBlocks: () =>
          new Promise(resolve => {
            entered = true
            release = resolve
          }),
      },
    })
    const pending = trust.authority.holder(principal, finish(material([])))
    while (!entered) await new Promise(resolve => setImmediate(resolve))
    generation.controls.revokeAuthorization()
    release({ kind: 'known', keys: ['suite.a'] })
    const decision = await pending
    expect(decision.kind).toBe('authorized')
    if (decision.kind === 'authorized') expect(decision.current()).toBe(false)
  })
})

describe('cross-tenant scope bindings are refused before any holder fact is read', () => {
  it('refuses a scope that is bound to another tenant', async () => {
    const h = holder({ kind: 'known', keys: ['suite.a'] })
    h.ports.bind(target, otherTenant)
    expect(await h.trust.authority.holder(principal, finish(material([])))).toEqual({
      kind: 'refused',
    })
    expect(h.asked).toEqual([])
  })

  it('refuses a scope that is not bound', async () => {
    const h = holder()
    h.ports.answerBinding(target, { kind: 'unbound' })
    expect(await h.trust.authority.holder(principal, finish(material([])))).toEqual({
      kind: 'refused',
    })
    expect(h.asked).toEqual([])
  })

  it('keeps an unreadable binding unreadable instead of reading it as unbound', async () => {
    for (const kind of ['unavailable', 'unknown'] as const) {
      const h = holder()
      h.ports.answerBinding(target, { kind })
      expect(await h.trust.authority.holder(principal, finish(material([])))).toEqual({ kind })
      expect(h.asked).toEqual([])
    }
  })

  it('hands the binding source through without caching an answer', async () => {
    const h = holder()
    h.ports.answerBinding(target, { kind: 'unknown' })
    expect(await h.trust.bindings.lookup(target)).toEqual({ kind: 'unknown' })
    h.ports.bind(target, tenant)
    expect(await h.trust.bindings.lookup(target)).toEqual({ kind: 'bound', tenant })
  })
})

describe('the original branch of the authority is kept', () => {
  const branches: readonly HolderDecision<string>[] = [
    { kind: 'refused' },
    { kind: 'unavailable' },
    { kind: 'unknown' },
    { kind: 'invalid', reason: 'checkpoint-conflict' },
  ]
  for (const branch of branches)
    it(`${branch.kind}${branch.kind === 'invalid' ? ` (${branch.reason})` : ''} reaches the caller as given, with no fact read`, async () => {
      const h = holder({ kind: 'known', keys: ['suite.a'] })
      h.ports.script(() => branch)
      expect(await h.trust.authority.holder(principal, finish(material([])))).toEqual(branch)
      expect(h.asked).toEqual([])
    })

  it('reads holder facts only to finish a recovery', async () => {
    const h = holder({ kind: 'known', keys: ['suite.a'] })
    const begun = await h.trust.authority.holder(principal, {
      kind: 'begin-replay',
      scope: target,
      tenant,
      through: null,
      supersedes: null,
      previous: { checkpoint: null, registrationRevision: 0, end: null },
    })
    const revoked = await h.trust.authority.holder(principal, {
      kind: 'revoke',
      eligibility: { eligibility: 'e1' },
    })
    expect([begun.kind, revoked.kind]).toEqual(['authorized', 'authorized'])
    expect(h.asked).toEqual([])
  })

  it('captures the bridge before the first await of every call', () => {
    const ports = createTestAuthorityPorts<string>()
    let captures = 0
    const authority: RuntimeContextAuthority<string> = ports.authority
    const bindings: ScopeBindingSource = ports.bindings
    const trust = createSessionRuntimeContextTrust<string>({
      authority,
      bindings,
      current: {
        capture() {
          captures++
          return { current: () => true }
        },
      },
      replayFacts: noStepCommits,
    })
    void trust.authority.holder(principal, finish(material([])))
    void trust.authority.producer(principal, {
      kind: 'register',
      tenant,
      key: 'suite.a',
      producer: { producer: 'p' },
    })
    expect(captures).toBe(2)
  })
})
