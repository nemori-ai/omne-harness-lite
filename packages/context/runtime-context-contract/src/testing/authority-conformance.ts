import assert from 'node:assert/strict'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ConformanceCase } from './case.js'
import { declaration, scope, openScope, snapshotValue, requiredBinding } from './fixtures.js'
import { start, started, addScope, type RuntimeContextFixture } from './suite.js'
import type { ScopeRef, SupplyAnswer } from '../index.js'

export const AUTHORITY_OBLIGATIONS = [
  'forged-first-binding-refused',
  'principal-tenant-mismatch-refused',
  'authority-unavailable-and-unknown',
  'stale-current-refused',
  'revocation-during-supply-discarded',
  'input-snapshot-stable',
  'producer-slot-per-tenant',
  'publish-tenant-mismatch-refused',
  'tenant-invalidate-scoped-to-tenant',
  'tenant-invalidate-batch-atomic',
  'supply-answer-mapping',
] as const
type AuthorityCase = (typeof AUTHORITY_OBLIGATIONS)[number]
const authorityCases = {
  'forged-first-binding-refused': forgedFirstBindingRefused,
  'principal-tenant-mismatch-refused': principalTenantMismatchRefused,
  'authority-unavailable-and-unknown': authorityUnavailableAndUnknown,
  'stale-current-refused': staleCurrentRefused,
  'revocation-during-supply-discarded': revocationDuringSupplyDiscarded,
  'input-snapshot-stable': inputSnapshotStable,
  'producer-slot-per-tenant': producerSlotPerTenant,
  'publish-tenant-mismatch-refused': publishTenantMismatchRefused,
  'tenant-invalidate-scoped-to-tenant': tenantInvalidateScopedToTenant,
  'tenant-invalidate-batch-atomic': tenantInvalidateBatchAtomic,
  'supply-answer-mapping': supplyAnswerMapping,
} satisfies Record<AuthorityCase, <P>(fixture: RuntimeContextFixture<P>) => Promise<void>>
export function authorityConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[] {
  return AUTHORITY_OBLIGATIONS.map(name => ({
    name,
    clause: 'RC-01/RC-07',
    run: authorityCases[name],
  }))
}

/** A scope bound to the other tenant cannot be claimed, registered into or published to (J18, J41). */
async function forgedFirstBindingRefused<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const foreign = scope('foreign')
  ports.bind(foreign, fixture.otherTenant)
  const unauthorized = { kind: 'refused', reason: 'unauthorized' }
  assert.deepEqual(
    await subject.beginReplay(fixture.principal, {
      scope: foreign,
      tenant: fixture.tenant,
      through: null,
      supersedes: null,
    }),
    unauthorized,
  )
  const unboundScope = scope('unbound')
  assert.deepEqual(
    await subject.beginReplay(fixture.principal, {
      scope: unboundScope,
      tenant: fixture.tenant,
      through: null,
      supersedes: null,
    }),
    unauthorized,
  )
  let calls = 0
  const p = await subject.registerProducer(fixture.principal, {
    key: 'suite.value',
    tenant: fixture.tenant,
    producer: { producer: 'suite' },
    declaration: declaration(),
    scoped: true,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(p.kind === 'registered')
  assert.deepEqual(
    await p.handle.publish({ scope: foreign, tenant: fixture.tenant, value: 1 }),
    unauthorized,
  )
  assert.deepEqual(
    await p.handle.invalidate({ kind: 'scope', scope: foreign, tenant: fixture.tenant }),
    unauthorized,
  )
  assert.equal(calls, 0)
}

/**
 * The principal belongs to the fixture tenant; the input names the other tenant, and the binding of
 * the scope agrees with the input. Only the authority port can refuse: it answers for the principal.
 */
async function principalTenantMismatchRefused<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const theirs = scope('theirs')
  ports.bind(theirs, fixture.otherTenant)
  ports.script(call =>
    'action' in call &&
    'tenant' in call.action &&
    tenantEquals(call.action.tenant, fixture.otherTenant)
      ? { kind: 'refused' }
      : undefined,
  )
  const unauthorized = { kind: 'refused', reason: 'unauthorized' }
  assert.deepEqual(
    await subject.beginReplay(fixture.principal, {
      scope: theirs,
      tenant: fixture.otherTenant,
      through: null,
      supersedes: null,
    }),
    unauthorized,
  )
  let calls = 0
  const registered = await subject.registerProducer(fixture.principal, {
    key: 'suite.value',
    tenant: fixture.otherTenant,
    producer: { producer: 'suite' },
    declaration: declaration(),
    scoped: true,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.deepEqual(registered, unauthorized)
  assert.equal(calls, 0)
}

async function authorityUnavailableAndUnknown<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const change = {
    kind: 'update',
    creating: false,
    scope: s.scope,
    tenant: s.tenant,
    key: 'suite.value',
    basedOn: 1,
    bindings: [requiredBinding()],
    parameters: undefined,
  } as const
  s.ports.script(call => (call.face === 'holder' ? { kind: 'unavailable' } : undefined))
  assert.deepEqual(
    await s.subject.applyCommit(s.principal, {
      kind: 'registration',
      commit: { commit: 'u' },
      change,
    }),
    {
      kind: 'unavailable',
      cause: 'authority',
    },
  )
  s.ports.script(call => (call.face === 'holder' ? { kind: 'unknown' } : undefined))
  assert.deepEqual(
    await s.subject.applyCommit(s.principal, {
      kind: 'registration',
      commit: { commit: 'x' },
      change,
    }),
    {
      kind: 'unknown',
      cause: 'authority',
    },
  )
  s.ports.script(undefined)
  s.ports.answerBinding(s.scope, { kind: 'unavailable' })
  assert.deepEqual(
    await s.subject.applyCommit(s.principal, {
      kind: 'registration',
      commit: { commit: 'b' },
      change,
    }),
    {
      kind: 'unavailable',
      cause: 'scope-binding',
    },
  )
  assert.deepEqual(await s.reader.snapshot(), { kind: 'unknown', cause: 'scope-binding-unknown' })
  s.ports.answerBinding(s.scope, { kind: 'bound', tenant: s.tenant })
  s.ports.script(call => (call.face === 'reader' ? { kind: 'unknown' } : undefined))
  assert.deepEqual(await s.reader.snapshot(), { kind: 'unknown', cause: 'eligibility-unknown' })
  s.ports.script(undefined)
  const applied = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'ok' },
    change,
  })
  assert.equal(applied.kind, 'applied')
}

/** An answer whose `current()` is false never lets a value take effect (RC-01 当前授权前提). */
async function staleCurrentRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })
  s.ports.script(call =>
    call.face === 'producer'
      ? { kind: 'authorized', principal: call.principal, current: () => false }
      : undefined,
  )
  assert.deepEqual(await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 2 }), {
    kind: 'refused',
    reason: 'unauthorized',
  })
  s.ports.script(undefined)
  assert.equal(await snapshotValue(s.reader), 1)
}

/** A revocation while the source answers discards the late value (RC-07 回调协议). */
async function revocationDuringSupplyDiscarded<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('revoked-supply')
  await openScope(subject, ports, fixture.principal, target, fixture.tenant)
  let release: (answer: SupplyAnswer<unknown>) => void = () => undefined
  let calls = 0
  const p = await subject.registerProducer(fixture.principal, {
    key: 'suite.value',
    tenant: fixture.tenant,
    producer: { producer: 'slow' },
    declaration: declaration(),
    scoped: false,
    supply: () => {
      calls++
      return new Promise<SupplyAnswer<unknown>>(resolve => {
        release = resolve
      })
    },
  })
  assert.ok(p.kind === 'registered')
  const applying = subject.applyCommit(fixture.principal, {
    kind: 'registration',
    commit: { commit: 'register' },
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
  while (calls === 0) await new Promise(resolve => setImmediate(resolve))
  ports.revokeAll()
  release({ kind: 'value', value: 5 })
  assert.equal((await applying).kind, 'applied')
  const issued = await subject.issueEligibility(fixture.principal, {
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
  const bound = await subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound')
  const read = await bound.reader.snapshot()
  assert.ok(read.kind === 'success')
  assert.equal(read.value.blocks.length, 0)
  assert.equal(read.value.missing.length, 1)
}

/** Changing the caller's input object after the call does not change the authorized target (RC-01 输入快照). */
async function inputSnapshotStable<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const other = scope('other-tenant-scope')
  s.ports.bind(other, fixture.otherTenant)
  const target: { ref: ScopeRef['ref'] } = { ref: s.scope.ref }
  const publishing = s.handle.publish({ scope: target, tenant: s.tenant, value: 3 })
  Reflect.set(target, 'ref', other.ref)
  const published = await publishing
  assert.ok(published.kind === 'published')
  assert.equal(published.scope.ref, s.scope.ref)
  assert.equal(await snapshotValue(s.reader), 3)
}

/** The producer slot is tenant plus key; another tenant registers the same key independently (J41). */
async function producerSlotPerTenant<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const other = await s.subject.registerProducer(s.principal, {
    key: 'suite.value',
    tenant: fixture.otherTenant,
    producer: { producer: 'other' },
    declaration: declaration(),
    scoped: true,
  })
  assert.ok(other.kind === 'registered')
  const mismatch = await s.subject.registerProducer(s.principal, {
    key: 'suite.value',
    tenant: fixture.otherTenant,
    producer: { producer: 'third' },
    declaration: declaration({ required: false }),
    scoped: true,
  })
  assert.deepEqual(mismatch, { kind: 'rejected', reason: 'declaration-mismatch' })
  await other.handle.dispose()
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 8 })
  assert.equal(await snapshotValue(s.reader), 8)
}

async function publishTenantMismatchRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  assert.deepEqual(
    await s.handle.publish({ scope: s.scope, tenant: fixture.otherTenant, value: 1 }),
    {
      kind: 'refused',
      reason: 'unauthorized',
    },
  )
  const missing = await s.reader.snapshot()
  assert.ok(missing.kind === 'success')
  assert.equal(missing.value.missing.length, 1)
}

/** A tenant invalidation lists and changes only the handle tenant's scopes (J41). */
async function tenantInvalidateScopedToTenant<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const foreign = scope('foreign-tenant')
  await openScope(s.subject, s.ports, s.principal, foreign, fixture.otherTenant)
  const added = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'foreign' },
    change: {
      kind: 'add',
      creating: true,
      scope: foreign,
      tenant: fixture.otherTenant,
      key: 'suite.value',
      basedOn: 0,
      required: false,
      bindings: [],
      parameters: undefined,
    },
  })
  assert.equal(added.kind, 'applied')
  const result = await s.handle.invalidate({ kind: 'tenant', tenant: s.tenant })
  assert.ok(result.kind === 'invalidated')
  assert.deepEqual(
    result.scopes.map(target => target.ref),
    [s.scope.ref],
  )
  assert.deepEqual(await s.handle.invalidate({ kind: 'tenant', tenant: fixture.otherTenant }), {
    kind: 'refused',
    reason: 'unauthorized',
  })
}

/** One refused target leaves the whole tenant batch unchanged (RC-07). */
async function tenantInvalidateBatchAtomic<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const second = await addScope(s, 'second')
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })
  await s.handle.publish({ scope: second, tenant: s.tenant, value: 2 })
  s.ports.script(call =>
    call.face === 'producer' &&
    call.action.kind === 'invalidate' &&
    call.action.scope.ref === second.ref
      ? { kind: 'refused' }
      : undefined,
  )
  assert.deepEqual(await s.handle.invalidate({ kind: 'tenant', tenant: s.tenant }), {
    kind: 'refused',
    reason: 'unauthorized',
  })
  s.ports.script(undefined)
  assert.equal(await snapshotValue(s.reader), 1)
}

/** The five supply answers and the protocol failures land in their closed read results (RC-07). */
async function supplyAnswerMapping<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('answers')
  await openScope(subject, ports, fixture.principal, target, fixture.tenant)
  let next: () => Promise<SupplyAnswer<unknown>> = async () => ({ kind: 'value', value: 1 })
  const p = await subject.registerProducer(fixture.principal, {
    key: 'suite.value',
    tenant: fixture.tenant,
    producer: { producer: 'answers' },
    declaration: declaration({ volatility: 'per-request' }),
    scoped: true,
    supply: () => next(),
  })
  assert.ok(p.kind === 'registered')
  await subject.applyCommit(fixture.principal, {
    kind: 'registration',
    commit: { commit: 'answers' },
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
  const issued = await subject.issueEligibility(fixture.principal, {
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
  const bound = await subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound')
  const reader = bound.reader
  next = async () => ({ kind: 'refused' })
  assert.deepEqual(await reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  // JSON.parse gives an untyped answer outside the closed set without a type assertion.
  const nonsense = async (): Promise<SupplyAnswer<unknown>> => JSON.parse('{"kind":"nonsense"}')
  const cases: readonly [() => Promise<SupplyAnswer<unknown>>, object][] = [
    [async () => ({ kind: 'unknown' }), { kind: 'unknown', cause: 'source-unknown' }],
    [
      async () => {
        throw new Error('source failed')
      },
      { kind: 'unknown', cause: 'source-unknown' },
    ],
    [nonsense, { kind: 'unknown', cause: 'source-unknown' }],
    [async () => ({ kind: 'unavailable' }), { kind: 'missing', cause: 'source-unavailable' }],
    [
      async () => ({ kind: 'value', value: 'not a number' }),
      { kind: 'missing', cause: 'uninterpretable' },
    ],
    [async () => ({ kind: 'none' }), { kind: 'missing', cause: 'no-value' }],
  ]
  for (const [answer, expected] of cases) {
    next = answer
    const r = await reader.snapshot()
    assert.ok(r.kind === 'success', `snapshot: ${r.kind}`)
    assert.deepEqual(r.value.perRequest[0], { key: 'suite.value', ...expected })
  }
}
