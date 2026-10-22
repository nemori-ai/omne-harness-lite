import assert from 'node:assert/strict'
import type { RuntimeContextFixture } from './conformance.js'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, numberSchema, scope, setup } from './fixtures.js'
import { reduceStep } from '../index.js'
import type { StatefulBlockDescriptor, ContextUpdate } from '../index.js'
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
async function reissueCannotChangeReaderScope<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()

  const s = await setup(subject, fixture.tenant, fixture.principal)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const other = scope('other-scope')
  const added = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'other-register' },
    change: {
      kind: 'add',
      scope: other,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      creating: true,
      bindings: [],
      parameters: undefined,
      required: true,
    },
  })
  assert.equal(added.kind, 'applied')
  await s.handle.publish(other, 987)
  const issued = await subject.issueEligibility({
    ...s.material,
    scope: other,
    supersedes: s.eligibility.id,
  })
  assert.ok(issued.kind === 'issued')
  const current = await subject.bind(issued.eligibility.id)
  assert.ok(current.kind === 'bound')
  const currentRead = await current.reader.snapshot()
  assert.ok(currentRead.kind === 'success')
  assert.equal(
    currentRead.value.blocks[0]?.state.kind === 'value'
      ? currentRead.value.blocks[0].state.value
      : undefined,
    987,
  )
  assert.equal(s.reader.scope.ref, s.scope.ref)
  assert.deepEqual(await s.reader.read([]), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.changes(before.value.cursor), {
    kind: 'refused',
    reason: 'unauthorized',
  })
  return
}

async function reissueCannotChangeReaderConsumer<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()

  const s = await setup(subject, fixture.tenant, fixture.principal)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const producer = await subject.registerProducer({
    key: 'suite.tool',
    producer: { producer: 'tool-only' },
    declaration: { ...declaration(), key: 'suite.tool', consumers: ['tool'] },
    scoped: true,
  })
  assert.ok(producer.kind === 'registered')
  const added = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'tool-register' },
    change: {
      kind: 'add',
      scope: s.scope,
      tenant: fixture.tenant,
      key: 'suite.tool',
      basedOn: 1,
      creating: false,
      bindings: [],
      parameters: undefined,
      required: false,
    },
  })
  assert.equal(added.kind, 'applied')
  await producer.handle.publish(s.scope, 99)
  const issued = await subject.issueEligibility({
    ...s.material,
    consumer: 'tool',
    keys: ['suite.tool'],
    registrationRevision: 2,
    supersedes: s.eligibility.id,
  })
  assert.ok(issued.kind === 'issued')
  const current = await subject.bind(issued.eligibility.id)
  assert.ok(current.kind === 'bound')
  assert.equal(current.reader.consumer, 'tool')
  const currentRead = await current.reader.snapshot()
  assert.ok(currentRead.kind === 'success')
  assert.equal(
    currentRead.value.blocks[0]?.state.kind === 'value'
      ? currentRead.value.blocks[0].state.value
      : undefined,
    99,
  )
  assert.equal(s.reader.consumer, 'model')
  assert.deepEqual(await s.reader.read([]), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.reader.changes(before.value.cursor), {
    kind: 'refused',
    reason: 'unauthorized',
  })
  return
}

async function registerBeforeProducerThenIncompatibleReadsMissing<P>(
  fixture: RuntimeContextFixture<P>,
) {
  const subject = await fixture.subject()

  const target = scope('early')
  const applied = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'early' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      required: true,
      parameters: 'undeclared',
      bindings: [],
    },
  })
  assert.equal(applied.kind, 'applied')
  const p = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'late' },
    declaration: declaration(),
    scoped: true,
  })
  assert.ok(p.kind === 'registered')
  await p.handle.publish(target, 7)
  const e = await subject.issueEligibility({
    scope: target,
    tenant: fixture.tenant,
    principal: fixture.principal,
    consumer: 'model',
    keys: ['suite.value'],
    bindings: [],
    supersedes: null,
    registrationRevision: 1,
  })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  const read = await b.reader.snapshot()
  assert.ok(read.kind === 'success')
  assert.equal(read.value.missing.length, 1)
  return
}

async function scopeIndependentCallbackAtThreePoints<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()

  const target = scope('independent')
  let calls = 0
  const registered = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'independent' },
    declaration: declaration(),
    scoped: false,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(registered.kind === 'registered')
  await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'one' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      bindings: [],
      required: true,
      parameters: undefined,
    },
  })
  assert.equal(calls, 1)
  await registered.handle.invalidate()
  assert.equal(calls, 2)
  const replacement = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'independent' },
    declaration: declaration(),
    scoped: false,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(replacement.kind === 'registered')
  assert.equal(calls, 3)
  return
}

async function perRequestBlockOutsideSnapshot<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()

  const target = scope('request')
  let calls = 0
  const p = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'request' },
    declaration: declaration({ volatility: 'per-request' }),
    scoped: true,
    supply: async () => ({ kind: 'value', value: ++calls }),
  })
  assert.ok(p.kind === 'registered')
  await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'request' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      bindings: [],
      parameters: undefined,
      required: true,
    },
  })
  const e = await subject.issueEligibility({
    scope: target,
    tenant: fixture.tenant,
    principal: fixture.principal,
    consumer: 'model',
    keys: ['suite.value'],
    bindings: [],
    registrationRevision: 1,
    supersedes: null,
  })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  const a = await b.reader.snapshot(),
    c = await b.reader.snapshot()
  assert.ok(a.kind === 'success' && c.kind === 'success')
  assert.equal(a.value.blocks.length, 0)
  assert.equal(a.value.perRequest[0]?.kind, 'value')
  assert.equal(calls, 2)
  assert.equal(a.value.viewRevision, c.value.viewRevision)
  return
}

async function cursorInvalidatedBelowRetention<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  if (fixture.retention === undefined) throw new NotApplicable('retention')
  for (let n = 0; n <= fixture.retention; n++) await s.handle.publish(s.scope, n)
  assert.deepEqual(await s.reader.changes(before.value.cursor), {
    kind: 'cursor-invalidated',
  })
  return
}

async function declarationDigestMismatchRefused<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  await setup(subject, fixture.tenant, fixture.principal)

  const r = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'suite' },
    declaration: declaration({ required: false }),
    scoped: true,
  })
  assert.deepEqual(r, { kind: 'rejected', reason: 'declaration-mismatch' })
  return
}

async function invalidateReadsMissingAndAdvances<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await s.handle.publish(s.scope, 1)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  await s.handle.invalidate(s.scope)
  const after = await s.reader.snapshot()
  assert.ok(after.kind === 'success')
  assert.ok(after.value.viewRevision > before.value.viewRevision)
  assert.equal(after.value.missing.length, 1)
  return
}

async function childScopeShadowsParent<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await s.handle.publish(s.scope, 10)
  const child = scope('child', s.scope)
  await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'child' },
    change: {
      kind: 'add',
      creating: true,
      scope: child,
      tenant: fixture.tenant,
      key: 'suite.other',
      bindings: [],
      required: false,
      parameters: undefined,
      basedOn: 0,
    },
  })
  const e = await subject.issueEligibility({ ...s.material, scope: child })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  const r = await b.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks[0]?.evidence.scope.ref, s.scope.ref)
  return
}

async function removedPlainRegistrationRefused<P>(fixture: RuntimeContextFixture<P>) {
  await removedRegistration(fixture, 'plain')
}

async function removedEligibilityCheckedRegistrationConcealed<P>(
  fixture: RuntimeContextFixture<P>,
) {
  await removedRegistration(fixture, 'eligibility-checked')
}

async function singleWriterPerStepRejectsSecond<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, target, key, d, first, second } = await statefulCase(fixture)
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
    reduced.rejected[0]?.rejection.kind === 'unauthorized'
      ? reduced.rejected[0].rejection.cause
      : undefined,
    'single-writer',
  )
  const committed = await subject.applyCommit({
    kind: 'step',
    commit: { commit: 'conflict' },
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
  return
}

async function pendingUpdatesNotApplied<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const { subject, target, first } = context

  const result = await subject.applyCommit({
    kind: 'step',
    commit: { commit: 'pending' },
    executionEnded: false,
    stepCommit: {
      scope: target,
      step: { step: 'failed' },
      committed: [],
      pending: [first],
    },
  })
  assert.equal(result.kind, 'applied')
  await assertStatefulMissing(fixture, context)
}

async function stepCommitIdempotent<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const { subject } = context
  const input = statefulCommit(context, 'tool', false)
  const result = await subject.applyCommit(input)
  assert.equal(result.kind, 'applied')
  assert.deepEqual(await subject.applyCommit(input), result)
}

async function unauthorizedUpdateRejectedAndCommitInvalid<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture)
  const { subject } = context
  const input = statefulCommit(context, 'model', false)
  const result = await subject.applyCommit(input)
  assert.ok(result.kind === 'invalid')
  assert.equal(result.reason, 'rejected-update')
}

async function untrackedBlockEndsWithExecution<P>(fixture: RuntimeContextFixture<P>) {
  const context = await statefulCase(fixture, 'untracked')
  const { subject } = context
  const input = statefulCommit(context, 'tool', true)
  const result = await subject.applyCommit(input)
  assert.equal(result.kind, 'applied')
  await assertStatefulMissing(fixture, context)
}

async function optionalNeedReadsNone<P>(fixture: RuntimeContextFixture<P>) {
  const { b } = await translatedCase(fixture, {
    necessity: 'optional',
    listed: true,
    translate: value => value,
  })
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.equal(r.value[0]?.kind, 'none')
}

async function translatedBlockNotReadableRaw<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, {
    necessity: 'required',
    listed: true,
    translate: value => value,
  })
  await s.handle.publish(s.scope, 12)
  const r = await b.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks.length, 0)
}

async function unlistedBindingRefused<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, {
    necessity: 'required',
    listed: false,
    translate: value => value,
  })
  await s.handle.publish(s.scope, 12)
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.deepEqual(r, { kind: 'refused', reason: 'unauthorized' })
}

async function translationThrowReadsMissing<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, {
    necessity: 'required',
    listed: true,
    translate: () => {
      throw new Error('translation refused')
    },
  })
  await s.handle.publish(s.scope, 12)
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'missing')
  assert.equal(r.items[0]?.cause, 'translation-failed')
}

async function translatedBindingGivesConsumerShape<P>(fixture: RuntimeContextFixture<P>) {
  const { s, b } = await translatedCase(fixture, {
    necessity: 'required',
    listed: true,
    translate: value => value,
  })
  await s.handle.publish(s.scope, 12)
  const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.equal(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 12)
}
async function removedRegistration<P>(
  fixture: RuntimeContextFixture<P>,
  disclosure: 'plain' | 'eligibility-checked',
) {
  const subject = await fixture.subject()

  const target = scope('removal')
  const producer = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'removable' },
    declaration: declaration({ required: false, disclosure }),
    scoped: true,
  })
  assert.ok(producer.kind === 'registered')
  const added = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'add' },
    change: {
      kind: 'add',
      scope: target,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      creating: true,
      required: false,
      parameters: undefined,
      bindings: [
        {
          key: 'suite.value',
          need: {
            name: 'value',
            shape: numberSchema,
            consumer: 'model',
            purpose: 'removal',
            necessity: 'optional',
          },
        },
      ],
    },
  })
  assert.equal(added.kind, 'applied')
  await producer.handle.publish(target, 7)
  const issued = await subject.issueEligibility({
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
  const before = await bound.reader.snapshot()
  assert.ok(before.kind === 'success')
  const removed = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'remove' },
    change: {
      kind: 'remove',
      scope: target,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 1,
      creating: false,
    },
  })
  assert.equal(removed.kind, 'applied')
  const expected = {
    kind: 'refused',
    reason: disclosure === 'plain' ? 'no-registration' : 'unauthorized',
  }
  assert.deepEqual(await bound.reader.read([{ key: 'suite.value', need: 'value' }]), expected)
  assert.deepEqual(await bound.reader.snapshot(), expected)
  return
}
async function statefulCase<P>(
  fixture: RuntimeContextFixture<P>,
  persistence: 'untracked' | 'checkpointed' = 'checkpointed',
) {
  const subject = await fixture.subject()
  const target = scope('stateful'),
    key = 'suite.state'
  const d: StatefulBlockDescriptor<typeof key, unknown, unknown> = {
    kind: 'stateful',
    key,
    schema: numberSchema,
    required: true,
    consumers: ['model'],
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    writers: ['tool'],
    singleWriterPerStep: true,
    persistence: persistence,
    reduce: (previous, update) => Number(previous ?? 0) + Number(update),
    updateSchema: numberSchema,
  }
  const reg = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'stateful' },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: fixture.tenant,
      key,
      basedOn: 0,
      required: true,
      parameters: undefined,
      bindings: [],
      declaration: d,
    },
  })
  assert.equal(reg.kind, 'applied')
  const first: ContextUpdate = {
      key,
      origin: { origin: 'first' },
      writer: 'tool',
      update: 1,
    },
    second: ContextUpdate = { key, origin: { origin: 'second' }, writer: 'tool', update: 3 }
  return { subject, target, key, d, first, second } as const
}
function statefulCommit<P>(
  context: Awaited<ReturnType<typeof statefulCase<P>>>,
  writer: 'model' | 'tool',
  executionEnded: boolean,
) {
  const { target, key, first } = context
  return {
    kind: 'step',
    commit: { commit: 'step' },
    executionEnded: executionEnded,
    stepCommit: {
      scope: target,
      step: { step: 'one' },
      committed: [
        {
          key,
          value: 1,
          updates: [{ ...first, writer }],
        },
      ],
      pending: [],
    },
  } as const
}
async function assertStatefulMissing<P>(
  fixture: RuntimeContextFixture<P>,
  context: Awaited<ReturnType<typeof statefulCase<P>>>,
) {
  const { subject, target, key } = context
  const e = await subject.issueEligibility({
    scope: target,
    tenant: fixture.tenant,
    principal: fixture.principal,
    consumer: 'model',
    keys: [key],
    bindings: [],
    registrationRevision: 1,
    supersedes: null,
  })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')
  const read = await b.reader.snapshot()
  assert.ok(read.kind === 'success')
  assert.equal(read.value.missing.length, 1)
}
async function translatedCase<P>(
  fixture: RuntimeContextFixture<P>,
  options: {
    necessity: 'optional' | 'required'
    listed: boolean
    translate: (value: unknown) => unknown
  },
) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = {
    kind: 'update',
    creating: false,
    scope: s.scope,
    tenant: fixture.tenant,
    key: 'suite.value',
    basedOn: 1,
    parameters: undefined,
    bindings: [
      {
        key: 'suite.value',
        need: {
          name: 'value',
          shape: numberSchema,
          consumer: 'model',
          purpose: 'test',
          necessity: options.necessity,
        },
        translate: options.translate,
        integrator: 'tool',
      },
    ],
  } as const
  const commit = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'translation' },
    change,
  })
  assert.equal(commit.kind, 'applied')
  const e = await subject.issueEligibility({
    ...s.material,
    keys: [],
    bindings: options.listed ? [{ key: 'suite.value', need: 'value' }] : [],
  })
  assert.ok(e.kind === 'issued')
  const b = await subject.bind(e.eligibility.id)
  assert.ok(b.kind === 'bound')

  return { s, b }
}
