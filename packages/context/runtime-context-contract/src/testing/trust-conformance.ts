import assert from 'node:assert/strict'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, scope, openScope, setup } from './fixtures.js'
import { createMemoryRuntimeContext } from './memory.js'
import { createTestAuthorityPorts } from './ports.js'
import {
  RUNTIME_CONTEXT_TRUST_DEPENDENCIES,
  type RuntimeContextTrustControls,
  type RuntimeContextTrustFace,
  type RuntimeContextTrustFixture,
} from './trust.js'
import type {
  AuthorityDecision,
  Eligibility,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  SupplyAnswer,
} from '../index.js'

export const RUNTIME_CONTEXT_TRUST_OBLIGATIONS = [
  'cross-tenant-zero-source-calls',
  'authorization-revocation-synchronous',
  'work-revocation-synchronous',
  'request-generation-synchronous',
  'bridge-invalidates-while-original-current',
  'original-current-false-refused',
  'revocation-during-await-discarded',
  'revocation-during-original-answer',
  'authorization-revocation-scoped',
  'work-revocation-scoped',
  'request-generation-scoped',
  'bridge-generation-scoped',
  'work-revocation-during-await-discarded',
  'request-replacement-old-disclosure-refused',
  'bridge-unload-late-callback-discarded',
  'scope-rebind-refused',
  'recovery-source-unknown',
  'async-notification-pending-revoked',
] as const
type TrustCase = (typeof RUNTIME_CONTEXT_TRUST_OBLIGATIONS)[number]
type Fixture<P> = RuntimeContextTrustFixture<P>

const trustCases = {
  'cross-tenant-zero-source-calls': crossTenantZeroSourceCalls,
  'authorization-revocation-synchronous': <P>(f: Fixture<P>) =>
    staleAtOnce(f, 'revokeAuthorization'),
  'work-revocation-synchronous': <P>(f: Fixture<P>) => staleAtOnce(f, 'revokeWork'),
  'request-generation-synchronous': <P>(f: Fixture<P>) =>
    staleAtOnce(f, 'advanceRequestGeneration'),
  'revocation-during-original-answer': revocationDuringOriginalAnswer,
  'authorization-revocation-scoped': <P>(f: Fixture<P>) => scopedToSource(f, 'revokeAuthorization'),
  'work-revocation-scoped': <P>(f: Fixture<P>) => scopedToSource(f, 'revokeWork'),
  'request-generation-scoped': <P>(f: Fixture<P>) => scopedToSource(f, 'advanceRequestGeneration'),
  'bridge-generation-scoped': <P>(f: Fixture<P>) => scopedToSource(f, 'advanceBridgeGeneration'),
  'bridge-invalidates-while-original-current': bridgeInvalidatesWhileOriginalCurrent,
  'original-current-false-refused': originalCurrentFalseRefused,
  'revocation-during-await-discarded': <P>(f: Fixture<P>) =>
    staleDuringRead(f, 'revokeAuthorization'),
  'work-revocation-during-await-discarded': <P>(f: Fixture<P>) => staleDuringRead(f, 'revokeWork'),
  'request-replacement-old-disclosure-refused': <P>(f: Fixture<P>) =>
    staleDuringRead(f, 'advanceRequestGeneration'),
  'bridge-unload-late-callback-discarded': <P>(f: Fixture<P>) =>
    staleDuringRead(f, 'advanceBridgeGeneration'),
  'scope-rebind-refused': scopeRebindRefused,
  'recovery-source-unknown': recoverySourceUnknown,
  'async-notification-pending-revoked': asyncNotificationPendingRevoked,
} satisfies Record<TrustCase, <P>(fixture: Fixture<P>) => Promise<void>>

/**
 * Cases for the bridge that hands the two original ports to Runtime Context. The suite owns the
 * original ports and only observes the trust through them and through a Runtime Context built on it.
 */
export function runtimeContextTrustConformance<P>(): readonly ConformanceCase<Fixture<P>>[] {
  return RUNTIME_CONTEXT_TRUST_OBLIGATIONS.map(name => ({
    name,
    clause: 'XC-RCBRIDGE',
    run: trustCases[name],
  }))
}

function build<P>(
  fixture: Fixture<P>,
  around: (original: RuntimeContextAuthority<P>) => RuntimeContextAuthority<P> = same => same,
) {
  const ports = createTestAuthorityPorts<P>()
  const made = fixture.create({ authority: around(ports.authority), bindings: ports.bindings })
  const subject = createMemoryRuntimeContext<P>(made.trust)
  return { ports, ...made, subject }
}

const FACES: readonly RuntimeContextTrustFace[] = ['holder', 'producer', 'reader']

/** One decision of one authority face, for the suite principal. */
async function ask<P>(
  trust: RuntimeContextTrust<P>,
  fixture: Fixture<P>,
  eligibility: Eligibility<P>,
  face: RuntimeContextTrustFace,
): Promise<AuthorityDecision<P>> {
  const { authority } = trust
  const decision =
    face === 'holder'
      ? await authority.holder(fixture.principal, { kind: 'revoke', eligibility: eligibility.id })
      : face === 'producer'
        ? await authority.producer(fixture.principal, {
            kind: 'register',
            tenant: fixture.tenant,
            key: 'suite.value',
            producer: { producer: 'suite' },
          })
        : await authority.reader(fixture.principal, eligibility)
  assert.ok(decision.kind === 'authorized', `authority answered ${decision.kind}`)
  assert.equal(decision.principal, fixture.principal)
  return decision
}

/** One decision per authority face, all for the same principal. */
async function decisions<P>(
  trust: RuntimeContextTrust<P>,
  fixture: Fixture<P>,
  eligibility: Eligibility<P>,
): Promise<readonly AuthorityDecision<P>[]> {
  const asked: AuthorityDecision<P>[] = []
  for (const face of FACES) asked.push(await ask(trust, fixture, eligibility, face))
  return asked
}

function reaches(control: keyof RuntimeContextTrustControls, face: RuntimeContextTrustFace) {
  return RUNTIME_CONTEXT_TRUST_DEPENDENCIES[control].some(reached => reached === face)
}

function currents<P>(asked: readonly AuthorityDecision<P>[]): boolean[] {
  return asked.map(decision => decision.kind === 'authorized' && decision.current())
}

/** A control makes the earlier answers that depend on its source stale in the same synchronous step; a later answer is current. */
async function staleAtOnce<P>(fixture: Fixture<P>, control: keyof RuntimeContextTrustControls) {
  const t = build(fixture)
  try {
    const s = await setup(t.subject, t.ports, fixture.tenant, fixture.principal)
    const before = await decisions(t.trust, fixture, s.eligibility)
    assert.deepEqual(currents(before), [true, true, true])
    t.controls[control]()
    const stale = currents(before)
    for (const [i, face] of FACES.entries())
      if (reaches(control, face))
        assert.equal(stale[i], false, `${face} answer still current after ${control}`)
    const after = await decisions(t.trust, fixture, s.eligibility)
    assert.deepEqual(currents(after), [true, true, true])
    assert.deepEqual(currents(before), stale)
  } finally {
    await t.subject.close()
  }
}

/**
 * A control belongs to one source: only the earlier answers that depend on that source turn stale,
 * the answers that depend on other sources only stay current.
 */
async function scopedToSource<P>(fixture: Fixture<P>, control: keyof RuntimeContextTrustControls) {
  const t = build(fixture)
  try {
    const s = await setup(t.subject, t.ports, fixture.tenant, fixture.principal)
    const before = await decisions(t.trust, fixture, s.eligibility)
    t.controls[control]()
    assert.deepEqual(
      currents(before),
      FACES.map(face => !reaches(control, face)),
      `answers after ${control}`,
    )
  } finally {
    await t.subject.close()
  }
}

/**
 * A control runs while the original port is still answering, before the bridge sees the answer:
 * the answer the caller then receives is stale for every face the source reaches. A bridge that
 * takes its generations after the original answered cannot pass this.
 */
async function revocationDuringOriginalAnswer<P>(fixture: Fixture<P>) {
  const controls = Object.keys(
    RUNTIME_CONTEXT_TRUST_DEPENDENCIES,
  ) as (keyof RuntimeContextTrustControls)[]
  for (const control of controls)
    for (const face of FACES) {
      let open: () => void = () => undefined
      const gate = new Promise<void>(resolve => {
        open = resolve
      })
      let armed = false
      let entered = false
      async function settle<D>(answer: D): Promise<D> {
        if (!armed) return answer
        entered = true
        await gate
        return answer
      }
      const slow = (original: RuntimeContextAuthority<P>): RuntimeContextAuthority<P> => ({
        holder: async (p, a) => settle(await original.holder(p, a)),
        producer: async (p, a) => settle(await original.producer(p, a)),
        reader: async (p, e) => settle(await original.reader(p, e)),
      })
      const t = build(fixture, slow)
      try {
        const s = await setup(t.subject, t.ports, fixture.tenant, fixture.principal)
        armed = true
        const pending = ask(t.trust, fixture, s.eligibility, face)
        while (!entered) await new Promise(resolve => setImmediate(resolve))
        t.controls[control]()
        open()
        const answer = await pending
        assert.equal(
          answer.kind === 'authorized' && answer.current(),
          !reaches(control, face),
          `${face} answer given after ${control} during the original answer`,
        )
      } finally {
        open()
        await t.subject.close()
      }
    }
}

/** The bridge alone goes stale: the original answer of the same call stays current. */
async function bridgeInvalidatesWhileOriginalCurrent<P>(fixture: Fixture<P>) {
  const t = build(fixture)
  try {
    const action = {
      kind: 'register',
      tenant: fixture.tenant,
      key: 'suite.value',
      producer: { producer: 'suite' },
    } as const
    const bridged = await t.trust.authority.producer(fixture.principal, action)
    const original = await t.ports.authority.producer(fixture.principal, action)
    assert.ok(bridged.kind === 'authorized' && original.kind === 'authorized')
    t.controls.advanceBridgeGeneration()
    assert.equal(original.current(), true)
    assert.equal(bridged.current(), false)
  } finally {
    await t.subject.close()
  }
}

/** The original answer is stale while the bridge is untouched: the bridged answer is stale too. */
async function originalCurrentFalseRefused<P>(fixture: Fixture<P>) {
  const t = build(fixture)
  try {
    const s = await setup(t.subject, t.ports, fixture.tenant, fixture.principal)
    t.ports.script(call => ({
      kind: 'authorized',
      principal: call.principal,
      current: () => false,
    }))
    assert.deepEqual(currents(await decisions(t.trust, fixture, s.eligibility)), [
      false,
      false,
      false,
    ])
    assert.deepEqual(await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 2 }), {
      kind: 'refused',
      reason: 'unauthorized',
    })
    t.ports.script(undefined)
    assert.deepEqual(currents(await decisions(t.trust, fixture, s.eligibility)), [true, true, true])
  } finally {
    await t.subject.close()
  }
}

/**
 * Known gap (#677): the original writer confirmed a revocation but no asynchronous notification has
 * arrived. A production composition must then fail this case. No fixture can supply a real
 * synchronous revocation source through this interface, and the test double must not make the case
 * pass by revoking at the test port, so the case reports NotApplicable for every fixture.
 */
async function asyncNotificationPendingRevoked<P>(_fixture: Fixture<P>): Promise<void> {
  throw new NotApplicable('synchronous revocation source (known gap #677)')
}

/** A per-request read whose source runs the given step while the read waits for it. */
async function staleDuringRead<P>(fixture: Fixture<P>, control: keyof RuntimeContextTrustControls) {
  const t = build(fixture)
  try {
    const target = scope('trust-late')
    await openScope(t.subject, t.ports, fixture.principal, target, fixture.tenant)
    let release: (answer: SupplyAnswer<unknown>) => void = () => undefined
    let calls = 0
    let hold = true
    const registered = await t.subject.registerProducer(fixture.principal, {
      key: 'suite.value',
      tenant: fixture.tenant,
      producer: { producer: 'late' },
      declaration: declaration({ volatility: 'per-request' }),
      scoped: true,
      supply: () => {
        calls++
        if (!hold) return Promise.resolve({ kind: 'value', value: 1 })
        return new Promise<SupplyAnswer<unknown>>(resolve => {
          release = resolve
        })
      },
    })
    assert.ok(registered.kind === 'registered')
    const commit = await t.subject.applyCommit(fixture.principal, {
      kind: 'registration',
      commit: { commit: 'late' },
      change: {
        kind: 'add',
        creating: true,
        scope: target,
        tenant: fixture.tenant,
        key: 'suite.value',
        basedOn: 0,
        required: true,
        bindings: [],
        parameters: undefined,
      },
    })
    assert.equal(commit.kind, 'applied')
    const issued = await t.subject.issueEligibility(fixture.principal, {
      scope: target,
      tenant: fixture.tenant,
      principal: fixture.principal,
      consumer: 'model',
      keys: ['suite.value'],
      bindings: [],
      registrationRevision: 1,
      supersedes: null,
    })
    assert.ok(issued.kind === 'issued')
    const bound = await t.subject.bind(issued.eligibility.id)
    assert.ok(bound.kind === 'bound')
    const reading = bound.reader.snapshot()
    while (calls === 0) await new Promise(resolve => setImmediate(resolve))
    t.controls[control]()
    hold = false
    release({ kind: 'value', value: 5 })
    assert.deepEqual(await reading, { kind: 'refused', reason: 'unauthorized' })
    const later = await bound.reader.snapshot()
    assert.ok(later.kind === 'success', `later snapshot: ${later.kind}`)
    const entry = later.value.perRequest[0]
    assert.ok(entry?.kind === 'value')
    assert.equal(entry.value, 1)
  } finally {
    await t.subject.close()
  }
}

/** A scope bound to the other tenant: the source is never called and nothing is claimed for it. */
async function crossTenantZeroSourceCalls<P>(fixture: Fixture<P>) {
  const t = build(fixture)
  try {
    const foreign = scope('foreign')
    t.ports.bind(foreign, fixture.otherTenant)
    let calls = 0
    const registered = await t.subject.registerProducer(fixture.principal, {
      key: 'suite.value',
      tenant: fixture.tenant,
      producer: { producer: 'suite' },
      declaration: declaration(),
      scoped: true,
      supply: async () => ({ kind: 'value', value: ++calls }),
    })
    assert.ok(registered.kind === 'registered')
    const unauthorized = { kind: 'refused', reason: 'unauthorized' }
    assert.deepEqual(
      await t.subject.beginReplay(fixture.principal, {
        scope: foreign,
        tenant: fixture.tenant,
        through: null,
        supersedes: null,
      }),
      unauthorized,
    )
    assert.deepEqual(
      await registered.handle.publish({ scope: foreign, tenant: fixture.tenant, value: 1 }),
      unauthorized,
    )
    assert.deepEqual(
      await registered.handle.invalidate({
        kind: 'scope',
        scope: foreign,
        tenant: fixture.tenant,
      }),
      unauthorized,
    )
    assert.equal(calls, 0)
  } finally {
    await t.subject.close()
  }
}

/** Bindings are read on every call: a scope that now answers another tenant is not served. */
async function scopeRebindRefused<P>(fixture: Fixture<P>) {
  const t = build(fixture)
  try {
    const s = await setup(t.subject, t.ports, fixture.tenant, fixture.principal)
    assert.equal(
      (await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })).kind,
      'published',
    )
    t.ports.answerBinding(s.scope, { kind: 'bound', tenant: fixture.otherTenant })
    assert.deepEqual(await t.trust.bindings.lookup(s.scope), {
      kind: 'bound',
      tenant: fixture.otherTenant,
    })
    assert.deepEqual(await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 2 }), {
      kind: 'refused',
      reason: 'unauthorized',
    })
  } finally {
    await t.subject.close()
  }
}

/** An unreadable or unknown binding source never reads as unbound, and nothing opens on it. */
async function recoverySourceUnknown<P>(fixture: Fixture<P>) {
  const t = build(fixture)
  try {
    for (const answer of [{ kind: 'unknown' }, { kind: 'unavailable' }] as const) {
      const recovering = scope('recovering-' + answer.kind)
      t.ports.answerBinding(recovering, answer)
      assert.deepEqual(await t.trust.bindings.lookup(recovering), answer)
      const begun = await t.subject.beginReplay(fixture.principal, {
        scope: recovering,
        tenant: fixture.tenant,
        through: null,
        supersedes: null,
      })
      assert.deepEqual(begun, { kind: answer.kind, cause: 'scope-binding' })
    }
  } finally {
    await t.subject.close()
  }
}
