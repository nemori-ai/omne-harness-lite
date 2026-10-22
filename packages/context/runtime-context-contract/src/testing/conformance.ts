import assert from 'node:assert/strict'
import { extendedConformance, EXTENDED_OBLIGATIONS } from './extended-conformance.js'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RuntimeContextOperations } from '../index.js'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, setup, scope } from './fixtures.js'
export type RuntimeContextFixture<P = unknown> = Readonly<{
  subject(): Promise<RuntimeContextOperations<P>>
  tenant: TenantId
  otherTenant: TenantId
  principal: P
  /** Retained change count of the fresh subject; required only for the retention case. */
  retention?: number
  close?(subject: RuntimeContextOperations<P>): Promise<void>
}>
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
export const RUNTIME_CONTEXT_OBLIGATIONS = [...CORE_OBLIGATIONS, ...EXTENDED_OBLIGATIONS] as const
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
  ]
}
async function scopeIsolatedPublication<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const other = scope('other')
  await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'other' },
    change: {
      kind: 'add',
      creating: true,
      scope: other,
      tenant: fixture.tenant,
      key: 'suite.value',
      basedOn: 0,
      required: false,
      bindings: [],
      parameters: undefined,
    },
  })
  await s.handle.publish(other, 42)
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing.length, 1)
  return
}

async function crossTenantRefused<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const e = await subject.issueEligibility({ ...s.material, tenant: fixture.otherTenant })
  if (e.kind === 'issued') {
    const b = await subject.bind(e.eligibility.id)
    if (b.kind === 'bound')
      assert.deepEqual(await b.reader.snapshot(), {
        kind: 'refused',
        reason: 'unauthorized',
      })
  }
  return
}

async function missingRequiredBlock<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing[0]?.key, 'suite.value')
  return
}

async function publicationShape<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await s.handle.publish(s.scope, 1)
  assert.equal((await s.handle.publish(s.scope, 'bad')).kind, 'rejected')
  const r = await s.reader.read([{ key: 'suite.value', need: 'value' }])
  assert.ok(r.kind === 'success')
  assert.deepEqual(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 1)
  return
}

async function oldGenerationPublication<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const { p } = await replaceProducer(s)

  await p.handle.publish(s.scope, 2)
  assert.equal((await s.handle.publish(s.scope, 1)).kind, 'rejected')
  await s.handle.dispose()
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(
    r.value.blocks[0]?.state.kind === 'value' ? r.value.blocks[0].state.value : undefined,
    2,
  )
}

async function producerIdentity<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  await setup(subject, fixture.tenant, fixture.principal)

  const p = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'other' },
    declaration: declaration(),
    scoped: true,
  })
  assert.deepEqual(p, { kind: 'rejected', reason: 'other-producer' })
  return
}

async function withdrawnProducerMissing<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await s.handle.publish(s.scope, 4)
  await s.handle.dispose()
  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.missing.length, 1)
  return
}

async function registrationReplay<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = initialRegistration(s.scope, fixture.tenant)

  const r = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'registration' },
    change,
  })
  assert.equal(r.kind, 'applied')
  return
}

async function registrationOrder<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = initialRegistration(s.scope, fixture.tenant)

  const r = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'later' },
    change,
  })
  assert.ok(r.kind === 'invalid')
  assert.equal(r.reason, 'out-of-order')
  return
}

async function registrationConflict<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = initialRegistration(s.scope, fixture.tenant)

  const r = await subject.applyCommit({
    kind: 'registration',
    commit: { commit: 'registration' },
    change: { ...change, parameters: 'different' },
  })
  assert.ok(r.kind === 'invalid')
  assert.equal(r.reason, 'commit-conflict')
  return
}

async function scopeTenantFixed<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = initialRegistration(s.scope, fixture.tenant)

  const r = await subject.prepareRegistration({
    ...change,
    kind: 'update',
    creating: false,
    basedOn: 1,
    tenant: fixture.otherTenant,
  })
  assert.equal(r.kind, 'rejected')
  return
}

async function requiredRemovalRefused<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const r = await subject.prepareRegistration({
    kind: 'remove',
    creating: false,
    scope: s.scope,
    tenant: fixture.tenant,
    key: 'suite.value',
    basedOn: 1,
  })
  assert.equal(r.kind, 'rejected')
  return
}

async function requiredAfterCreationRefused<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const change = initialRegistration(s.scope, fixture.tenant)

  const r = await subject.prepareRegistration({
    ...change,
    key: 'suite.another',
    creating: false,
    basedOn: 1,
    bindings: [],
  })
  assert.equal(r.kind, 'rejected')
  return
}

async function eligibilityRevoked<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await subject.revokeEligibility(s.eligibility.id)
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  return
}

async function eligibilitySuperseded<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  await subject.issueEligibility({ ...s.material, supersedes: s.eligibility.id, keys: [] })
  assert.deepEqual(await s.reader.changes(before.value.cursor), {
    kind: 'cursor-invalidated',
  })
  const after = await s.reader.snapshot()
  assert.ok(after.kind === 'success')
  assert.equal(after.value.blocks.length, 0)
  return
}

async function cursorReaderBound<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const snap = await s.reader.snapshot()
  assert.ok(snap.kind === 'success')
  const other = await subject.bind(s.eligibility.id)
  assert.ok(other.kind === 'bound')
  assert.deepEqual(await other.reader.changes(snap.value.cursor), {
    kind: 'cursor-invalidated',
  })
  return
}

async function cursorGenerationInvalidated<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)
  const { before } = await replaceProducer(s)
  assert.deepEqual(await s.reader.changes(before.value.cursor), { kind: 'cursor-invalidated' })
}

async function optionalBlockNone<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(
    subject,
    fixture.tenant,
    fixture.principal,
    declaration({ required: false }),
  )

  const r = await s.reader.snapshot()
  assert.ok(r.kind === 'success')
  assert.equal(r.value.blocks[0]?.state.kind, 'none')
  assert.equal(r.value.missing.length, 0)
  return
}

async function consumerFilter<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  const e = await subject.issueEligibility({ ...s.material, consumer: 'extension' })
  assert.deepEqual(e, { kind: 'refused', reason: 'unauthorized' })
  return
}

async function readerEnded<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  await s.reader.end()
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
  return
}

async function closedInstanceRefuses<P>(fixture: RuntimeContextFixture<P>) {
  const subject = await fixture.subject()
  const s = await setup(subject, fixture.tenant, fixture.principal)

  if (!fixture.close) throw new NotApplicable('close')
  await fixture.close(subject)
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
  assert.deepEqual(await subject.bind(s.eligibility.id), {
    kind: 'refused',
    reason: 'closed',
  })
  return
}
function initialRegistration(target: import('../shared.js').ScopeRef, tenant: TenantId) {
  return {
    kind: 'add',
    creating: true,
    scope: target,
    tenant,
    key: 'suite.value',
    basedOn: 0,
    required: true,
    parameters: undefined,
    bindings: [
      {
        key: 'suite.value',
        need: {
          name: 'value',
          shape: declaration().schema,
          consumer: 'model',
          purpose: 'conformance',
          necessity: 'required',
        },
      },
    ],
  } as const
}
async function replaceProducer<P>(s: Awaited<ReturnType<typeof setup<P>>>) {
  const subject = s.subject
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const p = await subject.registerProducer({
    key: 'suite.value',
    producer: { producer: 'suite' },
    declaration: declaration(),
    scoped: true,
  })
  assert.ok(p.kind === 'registered')
  assert.ok(p.handle.generation > s.handle.generation)
  return { before, p }
}
