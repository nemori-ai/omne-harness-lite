import assert from 'node:assert/strict'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, numberSchema, scope, setup, openScope, snapshotValue, type Setup } from './fixtures.js'
import { start, started, type RuntimeContextFixture } from './suite.js'
import { reduceStep } from '../index.js'
import type { StatefulBlockDescriptor, ContextUpdate, ScopeRef, CommitInput } from '../index.js'
export const EXTENDED_OBLIGATIONS = [
  'reissue-cannot-change-reader-consumer',
  'reissue-cannot-change-reader-scope',
  'removed-plain-registration-refused',
  'removed-eligibility-checked-registration-concealed',
  'cursor-invalidated-below-retention',
  'scope-independent-callback-at-three-points',
  'invalidate-reads-missing-and-advances',
  'step-commit-idempotent',
  'pending-updates-not-applied',
  'unauthorized-update-rejected-and-commit-invalid',
  'single-writer-per-step-rejects-second',
  'untracked-block-ends-with-execution',
  'translated-binding-gives-consumer-shape',
  'translated-block-not-readable-raw',
  'translation-throw-reads-missing',
  'unlisted-binding-refused',
  'per-request-block-outside-snapshot',
  'optional-need-reads-none',
  'child-scope-shadows-parent',
  'declaration-digest-mismatch-refused',
  'register-before-producer-then-incompatible-reads-missing',
] as const
type ExtendedCase = (typeof EXTENDED_OBLIGATIONS)[number]
const extendedCases = {
  'reissue-cannot-change-reader-consumer': reissueCannotChangeReaderConsumer,
  'reissue-cannot-change-reader-scope': reissueCannotChangeReaderScope,
  'removed-plain-registration-refused': removedPlainRegistrationRefused,
  'removed-eligibility-checked-registration-concealed':
    removedEligibilityCheckedRegistrationConcealed,
  'cursor-invalidated-below-retention': cursorInvalidatedBelowRetention,
  'scope-independent-callback-at-three-points': scopeIndependentCallbackAtThreePoints,
  'invalidate-reads-missing-and-advances': invalidateReadsMissingAndAdvances,
  'step-commit-idempotent': stepCommitIdempotent,
  'pending-updates-not-applied': pendingUpdatesNotApplied,
  'unauthorized-update-rejected-and-commit-invalid': unauthorizedUpdateRejectedAndCommitInvalid,
  'single-writer-per-step-rejects-second': singleWriterPerStepRejectsSecond,
  'untracked-block-ends-with-execution': untrackedBlockEndsWithExecution,
  'translated-binding-gives-consumer-shape': translatedBindingGivesConsumerShape,
  'translated-block-not-readable-raw': translatedBlockNotReadableRaw,
  'translation-throw-reads-missing': translationThrowReadsMissing,
  'unlisted-binding-refused': unlistedBindingRefused,
  'per-request-block-outside-snapshot': perRequestBlockOutsideSnapshot,
  'optional-need-reads-none': optionalNeedReadsNone,
  'child-scope-shadows-parent': childScopeShadowsParent,
  'declaration-digest-mismatch-refused': declarationDigestMismatchRefused,
  'register-before-producer-then-incompatible-reads-missing':
    registerBeforeProducerThenIncompatibleReadsMissing,
} satisfies Record<ExtendedCase, <P>(fixture: RuntimeContextFixture<P>) => Promise<void>>
export function extendedConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[] {
  return EXTENDED_OBLIGATIONS.map(name => ({
    name,
    clause: 'RC-02/RC-03/RC-04/RC-05/RC-07',
    run: extendedCases[name],
  }))
}

/** Opens a new scope of the setup's tenant and adds the suite block to it. */
async function addRequired<P>(s: Setup<P>, target: ScopeRef, commit: string) {
  await openScope(s.subject, s.ports, s.principal, target, s.tenant)
  const added = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit },
    change: {
      kind: 'add',
      scope: target,
      tenant: s.tenant,
      key: 'suite.value',
      basedOn: 0,
      creating: true,
      bindings: [],
      parameters: undefined,
      required: true,
    },
  })
  assert.equal(added.kind, 'applied')
}

async function bindReader<P>(s: Setup<P> | Fresh<P>, target: ScopeRef, keys: readonly ('suite.value' | 'suite.state')[]) {
  const issued = await s.subject.issueEligibility(s.principal, {
    scope: target,
    tenant: s.tenant,
    principal: s.principal,
    consumer: 'model',
    keys,
    bindings: [],
    registrationRevision: 1,
    supersedes: null,
  })
  assert.ok(issued.kind === 'issued', `issueEligibility: ${issued.kind}`)
  const bound = await s.subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound', `bind: ${bound.kind}`)
  return bound.reader
}

type Fresh<P> = Awaited<ReturnType<typeof fresh<P>>>
async function fresh<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  return { subject, ports, principal: fixture.principal, tenant: fixture.tenant }
}

async function reissueCannotChangeReaderScope<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const other = scope('other-scope')
  await addRequired(s, other, 'other-register')
  await s.handle.publish({ scope: other, tenant: s.tenant, value: 987 })
  const issued = await s.subject.issueEligibility(s.principal, {
    ...s.material,
    scope: other,
    supersedes: s.eligibility.id,
  })
  assert.ok(issued.kind === 'issued')
  const current = await s.subject.bind(issued.eligibility.id)
  assert.ok(current.kind === 'bound')
  assert.equal(await snapshotValue(current.reader), 987)
  assert.equal(s.reader.scope.ref, s.scope.ref)
  assert.deepEqual(await s.reader.read([]), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'refused', reason: 'unauthorized' })
}

async function reissueCannotChangeReaderConsumer<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const producer = await s.subject.registerProducer(s.principal, {
    key: 'suite.tool',
    tenant: s.tenant,
    producer: { producer: 'tool-only' },
    declaration: { ...declaration(), key: 'suite.tool', consumers: ['tool'] },
    scoped: true,
  })
  assert.ok(producer.kind === 'registered')
  const added = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'tool-register' },
    change: {
      kind: 'add',
      scope: s.scope,
      tenant: s.tenant,
      key: 'suite.tool',
      basedOn: 1,
      creating: false,
      bindings: [],
      parameters: undefined,
      required: false,
    },
  })
  assert.equal(added.kind, 'applied')
  await producer.handle.publish({ scope: s.scope, tenant: s.tenant, value: 99 })
  const issued = await s.subject.issueEligibility(s.principal, {
    ...s.material,
    consumer: 'tool',
    keys: ['suite.tool'],
    registrationRevision: 2,
    supersedes: s.eligibility.id,
  })
  assert.ok(issued.kind === 'issued')
  const current = await s.subject.bind(issued.eligibility.id)
  assert.ok(current.kind === 'bound')
  assert.equal(current.reader.consumer, 'tool')
  assert.equal(await snapshotValue(current.reader), 99)
  assert.equal(s.reader.consumer, 'model')
  assert.deepEqual(await s.reader.read([]), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'refused', reason: 'unauthorized' })
}

async function registerBeforeProducerThenIncompatibleReadsMissing<P>(fixture: RuntimeContextFixture<P>) {
  const f = await fresh(fixture)
  const target = scope('early')
  await openScope(f.subject, f.ports, f.principal, target, f.tenant)
  const applied = await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'early' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: f.tenant,
      key: 'suite.value',
      basedOn: 0,
      required: true,
      parameters: 'undeclared',
      bindings: [],
    },
  })
  assert.equal(applied.kind, 'applied')
  const p = await f.subject.registerProducer(f.principal, {
    key: 'suite.value',
    tenant: f.tenant,
    producer: { producer: 'late' },
    declaration: declaration(),
    scoped: true,
  })
  assert.ok(p.kind === 'registered')
  await p.handle.publish({ scope: target, tenant: f.tenant, value: 7 })
  const reader = await bindReader(f, target, ['suite.value'])
  const read = await reader.snapshot()
  assert.ok(read.kind === 'success')
  assert.equal(read.value.missing.length, 1)
}

async function scopeIndependentCallbackAtThreePoints<P>(fixture: RuntimeContextFixture<P>) {
  const f = await fresh(fixture)
  const target = scope('independent')
  await openScope(f.subject, f.ports, f.principal, target, f.tenant)
  let calls = 0
  const registered = await f.subject.registerProducer(f.principal, {
    key: 'suite.value',
    tenant: f.tenant,
    producer: { producer: 'independent' },
    declaration: declaration(),
    scoped: false,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(registered.kind === 'registered')
  await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'one' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: f.tenant,
      key: 'suite.value',
      basedOn: 0,
      bindings: [],
      required: true,
      parameters: undefined,
    },
  })
  assert.equal(calls, 1)
  await registered.handle.invalidate({ kind: 'tenant', tenant: f.tenant })
  assert.equal(calls, 2)
  const replacement = await f.subject.registerProducer(f.principal, {
    key: 'suite.value',
    tenant: f.tenant,
    producer: { producer: 'independent' },
    declaration: declaration(),
    scoped: false,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(replacement.kind === 'registered')
  assert.equal(calls, 3)
}

async function perRequestBlockOutsideSnapshot<P>(fixture: RuntimeContextFixture<P>) {
  const f = await fresh(fixture)
  const target = scope('request')
  await openScope(f.subject, f.ports, f.principal, target, f.tenant)
  let calls = 0
  const p = await f.subject.registerProducer(f.principal, {
    key: 'suite.value',
    tenant: f.tenant,
    producer: { producer: 'request' },
    declaration: declaration({ volatility: 'per-request' }),
    scoped: true,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(p.kind === 'registered')
  await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'request' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: f.tenant,
      key: 'suite.value',
      basedOn: 0,
      bindings: [],
      parameters: undefined,
      required: true,
    },
  })
  const reader = await bindReader(f, target, ['suite.value'])
  const a = await reader.snapshot(),
    c = await reader.snapshot()
  assert.ok(a.kind === 'success' && c.kind === 'success')
  assert.equal(a.value.blocks.length, 0)
  assert.equal(a.value.perRequest[0]?.kind, 'value')
  assert.equal(calls, 2)
  assert.equal(a.value.viewRevision, c.value.viewRevision)
}

async function cursorInvalidatedBelowRetention<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  if (fixture.retention === undefined) throw new NotApplicable('retention')
  for (let n = 0; n <= fixture.retention; n++) await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: n })
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'cursor-invalidated' })
}

async function declarationDigestMismatchRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.registerProducer(s.principal, {
    key: 'suite.value',
    tenant: s.tenant,
    producer: { producer: 'suite' },
    declaration: declaration({ required: false }),
    scoped: true,
  })
  assert.deepEqual(r, { kind: 'rejected', reason: 'declaration-mismatch' })
}

async function invalidateReadsMissingAndAdvances<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  await s.handle.invalidate({ kind: 'scope', scope: s.scope, tenant: s.tenant })
  const after = await s.reader.snapshot()
  assert.ok(after.kind === 'success')
  assert.ok(after.value.viewRevision > before.value.viewRevision)
  assert.equal(after.value.missing.length, 1)
}

async function childScopeShadowsParent<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 10 })
  const child = scope('child', s.scope)
  await openScope(s.subject, s.ports, s.principal, child, s.tenant)
  await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'child' },
    change: {
      kind: 'add',
      creating: true,
      scope: child,
      tenant: s.tenant,
      key: 'suite.other',
      bindings: [],
      required: false,
      parameters: undefined,
      basedOn: 0,
    },
  })
  const e = await s.subject.issueEligibility(s.principal, { ...s.material, scope: child })
  assert.ok(e.kind === 'issued')
  const b = await s.subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  const r = await b.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks[0]?.evidence.scope.ref, s.scope.ref)
}

async function removedPlainRegistrationRefused<P>(fixture: RuntimeContextFixture<P>) {
  await removedRegistration(fixture, 'plain')
}

async function removedEligibilityCheckedRegistrationConcealed<P>(fixture: RuntimeContextFixture<P>) {
  await removedRegistration(fixture, 'eligibility-checked')
}

async function singleWriterPerStepRejectsSecond<P>(fixture: RuntimeContextFixture<P>) {
  const { f, target, key, d, first, second } = await statefulCase(fixture)
  const reduced = reduceStep({
    scope: target,
    step: { step: 'one' },
    updates: [first, second],
    descriptors: { get: () => d },
    current: () => undefined,
  })
  assert.equal(reduced.committed[0]?.value, 1)
  assert.equal(reduced.rejected[0]?.rejection.kind, 'unauthorized')
  assert.equal(
    reduced.rejected[0]?.rejection.kind === 'unauthorized' ? reduced.rejected[0].rejection.cause : undefined,
    'single-writer',
  )
  const committed = await f.subject.applyCommit(f.principal, {
    kind: 'step',
    commit: { commit: 'conflict' },
    tenant: f.tenant,
    executionEnded: false,
    stepCommit: {
      scope: target,
      step: { step: 'one' },
      committed: [{ key, value: 4, updates: [first, second] }],
      pending: [],
    },
  })
  assert.ok(committed.kind === 'invalid')
  assert.equal(committed.reason, 'rejected-update')
}

async function pendingUpdatesNotApplied<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const { f, target, first } = context
  const result = await f.subject.applyCommit(f.principal, {
    kind: 'step',
    commit: { commit: 'pending' },
    tenant: f.tenant,
    executionEnded: false,
    stepCommit: { scope: target, step: { step: 'failed' }, committed: [], pending: [first] },
  })
  assert.equal(result.kind, 'applied')
  await assertStatefulMissing(context)
}

async function stepCommitIdempotent<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const input = statefulCommit(context, 'tool', false)
  const result = await context.f.subject.applyCommit(context.f.principal, input)
  assert.equal(result.kind, 'applied')
  assert.deepEqual(await context.f.subject.applyCommit(context.f.principal, input), result)
}

async function unauthorizedUpdateRejectedAndCommitInvalid<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const result = await context.f.subject.applyCommit(context.f.principal, statefulCommit(context, 'model', false))
  assert.ok(result.kind === 'invalid')
  assert.equal(result.reason, 'rejected-update')
}

async function untrackedBlockEndsWithExecution<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture, 'untracked')
  const result = await context.f.subject.applyCommit(context.f.principal, statefulCommit(context, 'tool', true))
  assert.equal(result.kind, 'applied')
  await assertStatefulMissing(context)
}

async function optionalNeedReadsNone<P>(fixture: RuntimeContextFixture<P>) {
  const { b } = await translatedCase(fixture, { necessity: 'optional', listed: true, translate: value => value })
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.equal(r.value[0]?.kind, 'none')
}

async function translatedBlockNotReadableRaw<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, { necessity: 'required', listed: true, translate: value => value })
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 12 })
  const r = await b.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks.length, 0)
}

async function unlistedBindingRefused<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, { necessity: 'required', listed: false, translate: value => value })
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 12 })
  assert.deepEqual(await b.reader.read([{ key: 'suite.value', need: 'value' }]), { kind: 'refused', reason: 'unauthorized' })
}

async function translationThrowReadsMissing<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, {
    necessity: 'required',
    listed: true,
    translate: () => {
      throw new Error('translation refused')
    },
  })
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 12 })
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'missing')
  assert.equal(r.items[0]?.cause, 'translation-failed')
}

async function translatedBindingGivesConsumerShape<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, { necessity: 'required', listed: true, translate: value => value })
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 12 })
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.equal(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 12)
}

async function removedRegistration<P>(fixture: RuntimeContextFixture<P>, disclosure: 'plain' | 'eligibility-checked') {
  const f = await fresh(fixture)
  const target = scope('removal')
  await openScope(f.subject, f.ports, f.principal, target, f.tenant)
  const producer = await f.subject.registerProducer(f.principal, {
    key: 'suite.value',
    tenant: f.tenant,
    producer: { producer: 'removable' },
    declaration: declaration({ required: false, disclosure }),
    scoped: true,
  })
  assert.ok(producer.kind === 'registered')
  const added = await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'add' },
    change: {
      kind: 'add',
      scope: target,
      tenant: f.tenant,
      key: 'suite.value',
      basedOn: 0,
      creating: true,
      required: false,
      parameters: undefined,
      bindings: [
        {
          key: 'suite.value',
          need: { name: 'value', shape: numberSchema, consumer: 'model', purpose: 'removal', necessity: 'optional' },
        },
      ],
    },
  })
  assert.equal(added.kind, 'applied')
  await producer.handle.publish({ scope: target, tenant: f.tenant, value: 7 })
  const reader = await bindReader(f, target, ['suite.value'])
  const before = await reader.snapshot()
  assert.ok(before.kind === 'success')
  const removed = await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'remove' },
    change: { kind: 'remove', scope: target, tenant: f.tenant, key: 'suite.value', basedOn: 1, creating: false },
  })
  assert.equal(removed.kind, 'applied')
  const expected = { kind: 'refused', reason: disclosure === 'plain' ? 'no-registration' : 'unauthorized' }
  assert.deepEqual(await reader.read([{ key: 'suite.value', need: 'value' }]), expected)
  assert.deepEqual(await reader.snapshot(), expected)
}

async function statefulCase<P>(fixture: RuntimeContextFixture<P>, persistence: 'untracked' | 'checkpointed' = 'checkpointed') {
  const f = await fresh(fixture)
  const target = scope('stateful'),
    key = 'suite.state'
  await openScope(f.subject, f.ports, f.principal, target, f.tenant)
  const d: StatefulBlockDescriptor<typeof key, unknown, unknown> = statefulDeclaration(persistence)
  const reg = await f.subject.applyCommit(f.principal, {
    kind: 'registration',
    commit: { commit: 'stateful' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: f.tenant,
      key,
      basedOn: 0,
      required: true,
      parameters: undefined,
      bindings: [],
      declaration: d,
    },
  })
  assert.equal(reg.kind, 'applied')
  const first: ContextUpdate = { key, origin: { origin: 'first' }, writer: 'tool', update: 1 },
    second: ContextUpdate = { key, origin: { origin: 'second' }, writer: 'tool', update: 3 }
  return { f, target, key, d, first, second } as const
}

/** The stateful block the suite uses: a tool-written counter. */
export function statefulDeclaration(
  persistence: 'untracked' | 'checkpointed',
): StatefulBlockDescriptor<'suite.state', unknown, unknown> {
  return {
    kind: 'stateful',
    key: 'suite.state',
    schema: numberSchema,
    required: true,
    consumers: ['model'],
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    writers: ['tool'],
    singleWriterPerStep: true,
    persistence,
    reduce: (previous, update) => Number(previous ?? 0) + Number(update),
    updateSchema: numberSchema,
  }
}

function statefulCommit<P>(
  context: Awaited<ReturnType<typeof statefulCase<P>>>,
  writer: 'model' | 'tool',
  executionEnded: boolean,
): CommitInput {
  const { target, key, first, f } = context
  return {
    kind: 'step',
    commit: { commit: 'step' },
    tenant: f.tenant,
    executionEnded,
    stepCommit: {
      scope: target,
      step: { step: 'one' },
      committed: [{ key, value: 1, updates: [{ ...first, writer }] }],
      pending: [],
    },
  }
}

async function assertStatefulMissing<P>(context: Awaited<ReturnType<typeof statefulCase<P>>>) {
  const reader = await bindReader(context.f, context.target, [context.key])
  const read = await reader.snapshot()
  assert.ok(read.kind === 'success')
  assert.equal(read.value.missing.length, 1)
}

async function translatedCase<P>(
  fixture: RuntimeContextFixture<P>,
  options: { necessity: 'optional' | 'required'; listed: boolean; translate: (value: unknown) => unknown },
) {
  const { subject, ports } = await start(fixture)
  const s = await setup(subject, ports, fixture.tenant, fixture.principal)
  const commit = await subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'translation' },
    change: {
      kind: 'update',
      creating: false,
      scope: s.scope,
      tenant: s.tenant,
      key: 'suite.value',
      basedOn: 1,
      parameters: undefined,
      bindings: [
        {
          key: 'suite.value',
          need: { name: 'value', shape: numberSchema, consumer: 'model', purpose: 'test', necessity: options.necessity },
          translate: options.translate,
          integrator: 'tool',
        },
      ],
    },
  })
  assert.equal(commit.kind, 'applied')
  const e = await subject.issueEligibility(s.principal, {
    ...s.material,
    keys: [],
    bindings: options.listed ? [{ key: 'suite.value', need: 'value' }] : [],
  })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  return { s, b }
}
