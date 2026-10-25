import assert from 'node:assert/strict'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, scope, openScope, snapshotValue, requiredBinding } from './fixtures.js'
import { start, started, type RuntimeContextFixture } from './suite.js'
import { statefulDeclaration } from './extended-conformance.js'
import type { RegistrationChange, ReplayMaterial, ScopeRef, CommitRef } from '../index.js'

export const REPLAY_OBLIGATIONS = [
  'scope-end-only',
  'scope-end-commit-conflict',
  'scope-end-atomic-with-registration',
  'replay-fence-closed-until-finish',
  'replay-begin-invalidates-readers',
  'replay-retry-and-conflict',
  'replay-restores-projection',
  'replay-capacity-unavailable',
  'replay-cannot-reopen-ended',
  'refresh-after-replay',
  'out-of-order-recovered-by-replay',
] as const
type ReplayCase = (typeof REPLAY_OBLIGATIONS)[number]
const replayCases = {
  'scope-end-only': scopeEndOnly,
  'scope-end-commit-conflict': scopeEndCommitConflict,
  'scope-end-atomic-with-registration': scopeEndAtomicWithRegistration,
  'replay-fence-closed-until-finish': replayFenceClosedUntilFinish,
  'replay-begin-invalidates-readers': replayBeginInvalidatesReaders,
  'replay-retry-and-conflict': replayRetryAndConflict,
  'replay-restores-projection': replayRestoresProjection,
  'replay-capacity-unavailable': replayCapacityUnavailable,
  'replay-cannot-reopen-ended': replayCannotReopenEnded,
  'refresh-after-replay': refreshAfterReplay,
  'out-of-order-recovered-by-replay': outOfOrderRecoveredByReplay,
} satisfies Record<ReplayCase, <P>(fixture: RuntimeContextFixture<P>) => Promise<void>>
export function replayConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[] {
  return REPLAY_OBLIGATIONS.map(name => ({ name, clause: 'RC-09', run: replayCases[name] }))
}

const EMPTY: ReplayMaterial = { registrations: [], checkpoints: [], end: null }

function addChange(
  target: ScopeRef,
  tenant: Parameters<typeof openScope>[4],
  basedOn = 0,
): RegistrationChange {
  return {
    kind: 'add',
    creating: basedOn === 0,
    scope: target,
    tenant,
    key: 'suite.value',
    basedOn,
    required: true,
    parameters: undefined,
    bindings: [requiredBinding()],
  }
}

async function scopeEndOnly<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const before = await s.reader.snapshot()
  assert.ok(before.kind === 'success')
  const ended = await s.subject.applyCommit(s.principal, {
    kind: 'scope',
    commit: { commit: 'end' },
    scope: s.scope,
    tenant: s.tenant,
    scopeEnded: true,
  })
  assert.ok(ended.kind === 'applied')
  assert.equal(ended.registrationRevision, 1)
  assert.equal(ended.viewRevision, before.value.viewRevision + 1)
  const again = await s.subject.applyCommit(s.principal, {
    kind: 'scope',
    commit: { commit: 'end-again' },
    scope: s.scope,
    tenant: s.tenant,
    scopeEnded: true,
  })
  assert.ok(again.kind === 'applied')
  assert.equal(again.viewRevision, ended.viewRevision)
  const scopeEnded = { kind: 'refused', reason: 'scope-ended' }
  assert.deepEqual(await s.reader.snapshot(), scopeEnded)
  assert.deepEqual(
    await s.subject.applyCommit(s.principal, {
      kind: 'registration',
      commit: { commit: 'after-end' },
      change: {
        kind: 'update',
        creating: false,
        scope: s.scope,
        tenant: s.tenant,
        key: 'suite.value',
        basedOn: 1,
        parameters: undefined,
        bindings: [requiredBinding()],
      },
    }),
    scopeEnded,
  )
  assert.deepEqual(await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 1 }), {
    kind: 'rejected',
    reason: 'scope-ended',
  })
  assert.deepEqual(await s.subject.issueEligibility(s.principal, s.material), scopeEnded)
}

async function scopeEndCommitConflict<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const conflict = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'registration' },
    change: addChange(s.scope, s.tenant),
    scopeEnded: true,
  })
  assert.ok(conflict.kind === 'invalid')
  assert.equal(conflict.reason, 'commit-conflict')
  const still = await s.reader.snapshot()
  assert.ok(still.kind === 'success', `snapshot: ${still.kind}`)
  assert.equal(still.value.missing.length, 1)
}

/** A registration that ends the scope applies both or neither (RC-09). */
async function scopeEndAtomicWithRegistration<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const bad = await s.subject.applyCommit(s.principal, {
    kind: 'registration',
    commit: { commit: 'remove-required' },
    change: {
      kind: 'remove',
      creating: false,
      scope: s.scope,
      tenant: s.tenant,
      key: 'suite.value',
      basedOn: 1,
    },
    scopeEnded: true,
  })
  assert.ok(bad.kind === 'invalid')
  const still = await s.reader.snapshot()
  assert.ok(still.kind === 'success', `snapshot: ${still.kind}`)
  assert.equal(still.value.missing.length, 1)
}

async function replayFenceClosedUntilFinish<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('fenced')
  ports.bind(target, fixture.tenant)
  const begun = await subject.beginReplay(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    through: null,
    supersedes: null,
  })
  assert.ok(begun.kind === 'replaying')
  const incomplete = { kind: 'refused', reason: 'replay-incomplete' }
  assert.deepEqual(
    await subject.applyCommit(fixture.principal, {
      kind: 'registration',
      commit: { commit: 'early' },
      change: addChange(target, fixture.tenant),
    }),
    incomplete,
  )
  assert.deepEqual(
    await subject.issueEligibility(fixture.principal, {
      scope: target,
      tenant: fixture.tenant,
      principal: fixture.principal,
      consumer: 'model',
      keys: [],
      bindings: [],
      registrationRevision: 0,
      supersedes: null,
    }),
    incomplete,
  )
  const ready = await subject.finishReplay(fixture.principal, {
    replay: begun.replay,
    material: EMPTY,
  })
  assert.ok(ready.kind === 'ready')
  assert.equal(ready.state, 'open')
  const applied = await subject.applyCommit(fixture.principal, {
    kind: 'registration',
    commit: { commit: 'early' },
    change: addChange(target, fixture.tenant),
  })
  assert.equal(applied.kind, 'applied')
}

async function replayBeginInvalidatesReaders<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  await s.handle.publish({ scope: s.scope, tenant: s.tenant, value: 6 })
  assert.equal(await snapshotValue(s.reader), 6)
  const previous = await s.subject.beginReplay(s.principal, {
    scope: s.scope,
    tenant: s.tenant,
    through: null,
    supersedes: null,
  })
  assert.ok(previous.kind === 'replaying')
  const begun = await s.subject.beginReplay(s.principal, {
    scope: s.scope,
    tenant: s.tenant,
    through: { commit: 'registration' },
    supersedes: previous.replay,
  })
  assert.ok(begun.kind === 'replaying')
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  const ready = await s.subject.finishReplay(s.principal, {
    replay: begun.replay,
    material: {
      registrations: [{ commit: { commit: 'registration' }, change: addChange(s.scope, s.tenant) }],
      checkpoints: [],
      end: null,
    },
  })
  assert.ok(ready.kind === 'ready')
  assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
  assert.deepEqual(await s.subject.bind(s.eligibility.id), {
    kind: 'refused',
    reason: 'unauthorized',
  })
  const issued = await s.subject.issueEligibility(s.principal, s.material)
  assert.ok(issued.kind === 'issued')
}

async function replayRetryAndConflict<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('retry')
  ports.bind(target, fixture.tenant)
  const input = { scope: target, tenant: fixture.tenant, through: null, supersedes: null }
  const first = await subject.beginReplay(fixture.principal, input)
  const second = await subject.beginReplay(fixture.principal, input)
  assert.ok(first.kind === 'replaying' && second.kind === 'replaying')
  assert.deepEqual(second.replay, first.replay)
  assert.deepEqual(
    await subject.beginReplay(fixture.principal, { ...input, through: { commit: 'other' } }),
    { kind: 'invalid', reason: 'replay-conflict' },
  )
  const ready = await subject.finishReplay(fixture.principal, {
    replay: first.replay,
    material: EMPTY,
  })
  assert.ok(ready.kind === 'ready')
  assert.deepEqual(
    await subject.finishReplay(fixture.principal, { replay: first.replay, material: EMPTY }),
    ready,
  )
  const different: ReplayMaterial = { ...EMPTY, end: { commit: { commit: 'end' } } }
  assert.deepEqual(
    await subject.finishReplay(fixture.principal, { replay: first.replay, material: different }),
    {
      kind: 'invalid',
      reason: 'replay-conflict',
    },
  )
  assert.deepEqual(
    await subject.finishReplay(fixture.principal, {
      replay: { replay: 'forged' },
      material: EMPTY,
    }),
    {
      kind: 'refused',
      reason: 'unauthorized',
    },
  )
}

/** A complete material installs registrations and checkpoint values without calling any source (RC-09). */
async function replayRestoresProjection<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('restored')
  ports.bind(target, fixture.tenant)
  const d = statefulDeclaration('checkpointed')
  const begun = await subject.beginReplay(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    through: { commit: 'step-2' },
    supersedes: null,
  })
  assert.ok(begun.kind === 'replaying')
  const registration: RegistrationChange = {
    kind: 'add',
    creating: true,
    scope: target,
    tenant: fixture.tenant,
    key: 'suite.state',
    basedOn: 0,
    required: true,
    parameters: undefined,
    bindings: [],
    declaration: d,
  }
  const ready = await subject.finishReplay(fixture.principal, {
    replay: begun.replay,
    material: {
      registrations: [{ commit: { commit: 'register' }, change: registration }],
      checkpoints: [
        {
          commit: { commit: 'step-2' },
          step: { step: 'two' },
          blocks: [{ key: 'suite.state', value: 9, updates: [] }],
        },
      ],
      end: null,
    },
  })
  assert.ok(ready.kind === 'ready')
  assert.equal(ready.registrationRevision, 1)
  const issued = await subject.issueEligibility(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    principal: fixture.principal,
    consumer: 'model',
    keys: ['suite.state'],
    bindings: [],
    registrationRevision: 1,
    supersedes: null,
  })
  assert.ok(issued.kind === 'issued')
  const bound = await subject.bind(issued.eligibility.id)
  assert.ok(bound.kind === 'bound')
  assert.equal(await snapshotValue(bound.reader), 9)
}

async function replayCapacityUnavailable<P>(fixture: RuntimeContextFixture<P>) {
  if (fixture.replayCapacity === undefined) throw new NotApplicable('replayCapacity')
  const { subject, ports } = await start(fixture)
  const target = scope('capacity')
  ports.bind(target, fixture.tenant)
  const begun = await subject.beginReplay(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    through: null,
    supersedes: null,
  })
  assert.ok(begun.kind === 'replaying')
  const registrations = Array.from({ length: fixture.replayCapacity + 1 }, (_, n) => ({
    commit: { commit: 'c' + n },
    change: addChange(target, fixture.tenant, n),
  }))
  assert.deepEqual(
    await subject.finishReplay(fixture.principal, {
      replay: begun.replay,
      material: { registrations, checkpoints: [], end: null },
    }),
    { kind: 'unavailable', cause: 'replay' },
  )
  const ready = await subject.finishReplay(fixture.principal, {
    replay: begun.replay,
    material: EMPTY,
  })
  assert.equal(ready.kind, 'ready')
}

async function replayCannotReopenEnded<P>(fixture: RuntimeContextFixture<P>) {
  const s = await started(fixture)
  const end: CommitRef = { commit: 'end' }
  await s.subject.applyCommit(s.principal, {
    kind: 'scope',
    commit: end,
    scope: s.scope,
    tenant: s.tenant,
    scopeEnded: true,
  })
  const previous = await s.subject.beginReplay(s.principal, {
    scope: s.scope,
    tenant: s.tenant,
    through: null,
    supersedes: null,
  })
  assert.ok(previous.kind === 'replaying')
  const begun = await s.subject.beginReplay(s.principal, {
    scope: s.scope,
    tenant: s.tenant,
    through: end,
    supersedes: previous.replay,
  })
  assert.ok(begun.kind === 'replaying')
  const registrations = [
    { commit: { commit: 'registration' }, change: addChange(s.scope, s.tenant) },
  ]
  assert.deepEqual(
    await s.subject.finishReplay(s.principal, {
      replay: begun.replay,
      material: { registrations, checkpoints: [], end: null },
    }),
    { kind: 'invalid', reason: 'checkpoint-conflict' },
  )
  const ready = await s.subject.finishReplay(s.principal, {
    replay: begun.replay,
    material: { registrations, checkpoints: [], end: { commit: end } },
  })
  assert.ok(ready.kind === 'ready')
  assert.equal(ready.state, 'ended')
  assert.deepEqual(await s.subject.issueEligibility(s.principal, s.material), {
    kind: 'refused',
    reason: 'scope-ended',
  })
}

/** Finishing a replay only marks supplied blocks; the next ordinary read supplies them (RC-09). */
async function refreshAfterReplay<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('refresh')
  let calls = 0
  let answer: 'value' | 'unavailable' = 'unavailable'
  const p = await subject.registerProducer(fixture.principal, {
    key: 'suite.value',
    tenant: fixture.tenant,
    producer: { producer: 'refresh' },
    declaration: declaration(),
    scoped: false,
    supply: async () => {
      calls++
      return answer === 'value' ? { kind: 'value', value: 11 } : { kind: 'unavailable' }
    },
  })
  assert.ok(p.kind === 'registered')
  ports.bind(target, fixture.tenant)
  const begun = await subject.beginReplay(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    through: { commit: 'register' },
    supersedes: null,
  })
  assert.ok(begun.kind === 'replaying')
  const ready = await subject.finishReplay(fixture.principal, {
    replay: begun.replay,
    material: {
      registrations: [
        { commit: { commit: 'register' }, change: addChange(target, fixture.tenant) },
      ],
      checkpoints: [],
      end: null,
    },
  })
  assert.ok(ready.kind === 'ready')
  assert.equal(calls, 0)
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
  const failed = await bound.reader.snapshot()
  assert.ok(failed.kind === 'success')
  assert.equal(failed.value.missing[0]?.cause, 'source-unavailable')
  assert.equal(calls, 1)
  answer = 'value'
  assert.equal(await snapshotValue(bound.reader), 11)
  assert.equal(calls, 2)
  assert.equal(await snapshotValue(bound.reader), 11)
  assert.equal(calls, 2)
}

/** After out-of-order, a superseding replay catches the projection up and the original retry applies (RC-09). */
async function outOfOrderRecoveredByReplay<P>(fixture: RuntimeContextFixture<P>) {
  const { subject, ports } = await start(fixture)
  const target = scope('catch-up')
  const first = await openScope(subject, ports, fixture.principal, target, fixture.tenant)
  const c1 = addChange(target, fixture.tenant)
  const c2: RegistrationChange = {
    ...c1,
    kind: 'update',
    creating: false,
    basedOn: 1,
    parameters: undefined,
    bindings: [],
  }
  const late = await subject.applyCommit(fixture.principal, {
    kind: 'registration',
    commit: { commit: 'c2' },
    change: c2,
  })
  assert.ok(late.kind === 'invalid')
  assert.equal(late.reason, 'out-of-order')
  const begun = await subject.beginReplay(fixture.principal, {
    scope: target,
    tenant: fixture.tenant,
    through: { commit: 'c1' },
    supersedes: first,
  })
  assert.ok(begun.kind === 'replaying')
  const ready = await subject.finishReplay(fixture.principal, {
    replay: begun.replay,
    material: {
      registrations: [{ commit: { commit: 'c1' }, change: c1 }],
      checkpoints: [],
      end: null,
    },
  })
  assert.ok(ready.kind === 'ready')
  const retried = await subject.applyCommit(fixture.principal, {
    kind: 'registration',
    commit: { commit: 'c2' },
    change: c2,
  })
  assert.ok(retried.kind === 'applied')
  assert.equal(retried.registrationRevision, 2)
}
