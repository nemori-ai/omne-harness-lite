import assert from 'node:assert/strict'
import { extendedConformance, EXTENDED_OBLIGATIONS } from './extended-conformance.js'
import { authorityConformance, AUTHORITY_OBLIGATIONS } from './authority-conformance.js'
import { replayConformance, REPLAY_OBLIGATIONS } from './replay-conformance.js'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '../index.js'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, setup, requiredBinding, snapshotValue, type Setup } from './fixtures.js'
import { start, started, addScope, type RuntimeContextFixture } from './suite.js'
export type { RuntimeContextFixture, RuntimeContextPorts } from './suite.js'

const CORE_OBLIGATIONS = [
  'scope-isolated-publication',
  'cross-tenant-refused',
  'missing-required-block',
  'publication-shape',
  'old-generation-publication',
  'producer-identity',
  'withdrawn-producer-missing',
  'registration-replay',
  'registration-order',
  'registration-conflict',
  'scope-tenant-fixed',
  'required-removal-refused',
  'required-after-creation-refused',
  'eligibility-revoked',
  'eligibility-superseded',
  'cursor-reader-bound',
  'cursor-generation-invalidated',
  'optional-block-none',
  'consumer-filter',
  'reader-ended',
  'closed-instance-refuses',
] as const
export const RUNTIME_CONTEXT_OBLIGATIONS = [
  ...CORE_OBLIGATIONS,
  ...EXTENDED_OBLIGATIONS,
  ...AUTHORITY_OBLIGATIONS,
  ...REPLAY_OBLIGATIONS,
] as const
export type RuntimeContextObligation = (typeof RUNTIME_CONTEXT_OBLIGATIONS)[number]
type CoreCase = (typeof CORE_OBLIGATIONS)[number]
const coreCases = {
  'scope-isolated-publication': scopeIsolatedPublication,
  'cross-tenant-refused': crossTenantRefused,
  'missing-required-block': missingRequiredBlock,
  'publication-shape': publicationShape,
  'old-generation-publication': oldGenerationPublication,
  'producer-identity': producerIdentity,
  'withdrawn-producer-missing': withdrawnProducerMissing,
  'registration-replay': registrationReplay,
  'registration-order': registrationOrder,
  'registration-conflict': registrationConflict,
  'scope-tenant-fixed': scopeTenantFixed,
  'required-removal-refused': requiredRemovalRefused,
  'required-after-creation-refused': requiredAfterCreationRefused,
  'eligibility-revoked': eligibilityRevoked,
  'eligibility-superseded': eligibilitySuperseded,
  'cursor-reader-bound': cursorReaderBound,
  'cursor-generation-invalidated': cursorGenerationInvalidated,
  'optional-block-none': optionalBlockNone,
  'consumer-filter': consumerFilter,
  'reader-ended': readerEnded,
  'closed-instance-refuses': closedInstanceRefuses,
} satisfies Record<CoreCase, <P>(fixture: RuntimeContextFixture<P>) => Promise<void>>
export function runtimeContextConformance<P>(): readonly ConformanceCase<
  RuntimeContextFixture<P>
>[] {
  return [
    ...CORE_OBLIGATIONS.map(name => ({
      name,
      clause: name.includes('registration')
        ? 'RC-02'
        : name.includes('producer') || name.includes('generation')
          ? 'RC-07'
          : 'RC-03/RC-04',
      run: coreCases[name],
    })),
    ...extendedConformance<P>(),
    ...authorityConformance<P>(),
    ...replayConformance<P>(),
  ]
}

async function scopeIsolatedPublication<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const other = await addScope(s, 'other')
  assert.equal((await s.handle.publish({ scope: other, tenant: s.tenant, value: 42 })).kind, 'published')
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing.length, 1)
}

async function crossTenantRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  assert.deepEqual(await s.subject.issueEligibility(s.principal, { ...s.material, tenant: fixture.otherTenant }), {
    kind: 'refused',
    reason: 'unauthorized',
  })
}

async function missingRequiredBlock<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing[0]?.key, 'suite.value')
}

async function publicationShape<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })
  assert.equal((await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 'bad' })).kind, 'rejected')
  const r = await s.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.deepEqual(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 1)
}

async function oldGenerationPublication<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const { p } = await replaceProducer(s)
  await p.handle.publish({ scope: s.scope, tenant: s.tenant, value: 2 })
  assert.equal((await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 })).kind, 'rejected')
  await s.handle.dispose()
  assert.equal(await snapshotValue(s.reader), 2)
}

async function producerIdentity<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const p = await s.subject.registerProducer(s.principal, {
    key: 'suite.value',
    tenant: s.tenant,
    producer: { producer: 'other' },
    declaration: declaration(),
    scoped: true,
  })
  assert.deepEqual(p, { kind: 'rejected', reason: 'other-producer' })
}

async function withdrawnProducerMissing<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 4 })
  await s.handle.dispose()
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing.length, 1)
}

function initialRegistration(target: ScopeRef, tenant: TenantId) {
  return {
    kind: 'add',
    creating: true,
    scope: target,
    tenant,
    key: 'suite.value',
    basedOn: 0,
    required: true,
    parameters: undefined,
    bindings: [requiredBinding()],
  } as const
}

async function registrationReplay<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'registration' },
    change: initialRegistration(s.scope, s.tenant),
  })
  assert.equal(r.kind, 'applied')
}

async function registrationOrder<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'later' },
    change: initialRegistration(s.scope, s.tenant),
  })
  assert.ok(r.kind === 'invalid')
  assert.equal(r.reason, 'out-of-order')
}

async function registrationConflict<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'registration' },
    change: { ...initialRegistration(s.scope, s.tenant), parameters: 'different' },
  })
  assert.ok(r.kind === 'invalid')
  assert.equal(r.reason, 'commit-conflict')
}

async function scopeTenantFixed<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.prepareRegistration(s.principal, {
    ...initialRegistration(s.scope, s.tenant),
    kind: 'update',
    creating: false,
    basedOn: 1,
    tenant: fixture.otherTenant,
  })
  assert.deepEqual(r, { kind: 'refused', reason: 'unauthorized' })
}

async function requiredRemovalRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.prepareRegistration(s.principal, {
    kind: 'remove',
    creating: false,
    scope: s.scope,
    tenant: s.tenant,
    key: 'suite.value',
    basedOn: 1,
  })
  assert.equal(r.kind, 'rejected')
}

async function requiredAfterCreationRefused<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const r = await s.subject.prepareRegistration(s.principal, {
    ...initialRegistration(s.scope, s.tenant),
    key: 'suite.another',
    creating: false,
    basedOn: 1,
    bindings: [],
  })
  assert.equal(r.kind, 'rejected')
}

async function eligibilityRevoked<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.subject.revokeEligibility(s.principal, s.eligibility.id)
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
}

async function eligibilitySuperseded<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  await s.subject.issueEligibility(s.principal, { ...s.material, supersedes: s.eligibility.id, keys: [] })
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'cursor-invalidated' })
  const after = await s.reader.snapshot()
  assert.ok(after.kind === 'success')
  assert.equal(after.value.blocks.length, 0)
}

async function cursorReaderBound<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const snap = await s.reader.snapshot()
  assert.ok(snap.kind === 'success')
  const other = await s.subject.bind(s.eligibility.id)
  assert.ok(other.kind === 'bound')
  assert.deepEqual(await other.reader.changes(snap.value.cursor), { kind: 'cursor-invalidated' })
}

async function cursorGenerationInvalidated<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const { before } = await replaceProducer(s)
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'cursor-invalidated' })
}

async function optionalBlockNone<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const s = await setup(subject, ports, fixture.tenant, fixture.principal, declaration({ required: false }))
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks[0]?.state.kind, 'none')
  assert.equal(r.value.missing.length, 0)
}

async function consumerFilter<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const e = await s.subject.issueEligibility(s.principal, { ...s.material, consumer: 'extension' })
  assert.deepEqual(e, { kind: 'refused', reason: 'unauthorized' })
}

async function readerEnded<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.reader.end()
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
}

async function closedInstanceRefuses<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  if (!fixture.close) throw new NotApplicable('close')
  await fixture.close(s.subject)
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
  assert.deepEqual(await s.subject.bind(s.eligibility.id), { kind: 'refused', reason: 'closed' })
}

async function replaceProducer<P>(s: Setup<P>) {
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const p = await s.subject.registerProducer(s.principal, {
    key: 'suite.value',
    tenant: s.tenant,
    producer: { producer: 'suite' },
    declaration: declaration(),
    scoped: true,
  })
  assert.ok(p.kind === 'registered')
  assert.ok(p.handle.generation > s.handle.generation)
  return { before, p }
}
