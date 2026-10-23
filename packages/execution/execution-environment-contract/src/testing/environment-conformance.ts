import assert from 'node:assert/strict'
import {
  acquisitionRef,
  originRef,
  commandFacility,
  describeFacility,
  acquireParamsSchema,
  type Access,
  type AcquireInput,
  type Acquired,
  type ExecutionEnvironment,
  type ProviderRegistrations,
  type EnvironmentRequirement,
  type ProviderAcquireInput,
  type EnvironmentBinding,
} from '../index.ts'
import {
  createMemoryResourceLedger,
  createScriptedEnvironmentProvider,
  createScriptedFacilityGuard,
} from './doubles.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'
export type EnvironmentConformanceSubject<P> = Readonly<{
  environment: ExecutionEnvironment<P> & ProviderRegistrations
  access: Access<P>
  otherAccess?: Access<P>
  scope: ProviderAcquireInput['scope']
  hooks?: { close?(): Promise<void> }
  dispose?(): Promise<void>
}>
export type EnvironmentConformanceOptions<P> = Readonly<{
  subject(): EnvironmentConformanceSubject<P> | Promise<EnvironmentConformanceSubject<P>>
  waitMs?: number
}>
type EnvironmentFixture<P> = Awaited<ReturnType<typeof setupEnvironmentFixture<P>>>
const host: EnvironmentBinding = { kind: 'host_machine' }
function anotherScope<P>(
  scope: EnvironmentConformanceSubject<P>['scope'],
): EnvironmentConformanceSubject<P>['scope'] {
  const ref = scope.ref + '-other'
  function valid(text: string): text is EnvironmentConformanceSubject<P>['scope']['ref'] {
    return text.length > 0
  }
  if (!valid(ref)) throw new TypeError('empty test scope')
  return { ref }
}
async function setupEnvironmentFixture<P>(
  s: EnvironmentConformanceSubject<P>,
  script: Parameters<typeof createScriptedEnvironmentProvider>[0] = {},
) {
  const provider = createScriptedEnvironmentProvider(script)
  const removeFacility = s.environment.registerFacility(commandFacility)
  const removeProvider = s.environment.registerProvider(provider)
  const requirement: EnvironmentRequirement = {
    allowedBindings: [host],
    facilities: ['command'],
    isolation: [],
  }
  const resolved = await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement })
  assert.equal(resolved.kind, 'placement')
  if (resolved.kind !== 'placement') throw new Error('no placement')
  const ledger = createMemoryResourceLedger()
  const guard = createScriptedFacilityGuard<P>()
  const input: AcquireInput<P> = {
    acquisition: acquisitionRef('suite-key'),
    origin: originRef('suite-origin'),
    scope: s.scope,
    placement: resolved,
    ledger: ledger.ledger,
    guard,
  }
  const acquire = () => s.environment.acquire(s.access, input)
  async function acquired(): Promise<Acquired> {
    const a = await acquire()
    assert.equal(a.kind, 'acquired')
    if (a.kind !== 'acquired') throw new Error('no lease')
    return a
  }
  return {
    provider,
    removeFacility,
    removeProvider,
    requirement,
    placement: resolved,
    ledger,
    guard,
    input,
    acquire,
    acquired,
  }
}
function environmentCase<P>(
  options: EnvironmentConformanceOptions<P>,
  name: string,
  run: (s: EnvironmentConformanceSubject<P>) => Promise<void>,
): ConformanceCase {
  return {
    name,
    async run() {
      const s = await options.subject()
      try {
        await bounded(run(s), options.waitMs ?? 1000)
      } finally {
        await s.dispose?.()
      }
    },
  }
}
function fixtureCase<P>(
  options: EnvironmentConformanceOptions<P>,
  name: string,
  run: (s: EnvironmentConformanceSubject<P>, f: EnvironmentFixture<P>) => Promise<void>,
): ConformanceCase {
  return environmentCase(options, name, async s => run(s, await setupEnvironmentFixture(s)))
}
const commandOf = (a: Acquired) => {
  const f = a.lease.facility('command')
  assert.ok(f)
  return f
}
const commandRequest = <P>(s: EnvironmentConformanceSubject<P>, f: EnvironmentFixture<P>) => ({
  requestId: 'suite-start',
  origin: f.input.origin,
  access: s.access,
  binding: host,
  executable: 'true',
  args: [],
  cwd: '.',
  env: {},
  outputMode: 'separate' as const,
})

async function checkAdoptionIssuedFromVerifiedReceipt<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const fake = { forged: true }
  const f = await setupEnvironmentFixture(s, { extraReceiptFields: { adoption: fake } })
  const a = await f.acquired()
  assert.notEqual(a.adoption, fake)
  assert.deepEqual(a.adoption, {
    acquisition: f.input.acquisition,
    origin: f.input.origin,
    placement: f.placement,
    provider: {
      name: f.provider.name,
      generation: f.provider.generation,
      version: f.provider.version,
    },
    instance: a.lease.instance,
    continuity: a.lease.continuity,
    evidence: { kind: 'boolean', value: true },
  })
}

async function checkMismatchedReceiptBindingIsRefused<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, {
    receiptBinding: { kind: 'session_sandbox', scope: s.scope },
  })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unavailable' })
  assert.equal(f.provider.calls.release, 1)
}

async function checkReceiptMissingFacilityIsRefused<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, { lease: {} })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unsupportedFacility' })
  assert.equal(f.provider.calls.release, 1)
}

async function checkRepeatKeyReturnsSameAcquisition<P>(
  _s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired(),
    b = await f.acquired()
  assert.equal(a.lease, b.lease)
  assert.equal(a.adoption, b.adoption)
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkDifferentPlacementSameKeyIsConflict<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  await f.acquired()
  assert.deepEqual(
    await s.environment.acquire(s.access, {
      ...f.input,
      placement: { ...f.placement, binding: { kind: 'session_sandbox', scope: s.scope } },
    }),
    { kind: 'rejected', reason: 'invalidInput' },
  )
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkOtherTenantDoesNotSeeKey<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  if (!s.otherAccess) throw new NotApplicable('requires another tenant')
  const a = await f.acquired()
  assert.deepEqual(await s.environment.inspectAcquisition(s.otherAccess, f.input.acquisition), {
    kind: 'unrecorded',
  })
  const b = await s.environment.acquire(s.otherAccess, f.input)
  assert.equal(b.kind, 'acquired')
  assert.equal(f.provider.calls.acquire, 2)
  assert.deepEqual(await s.environment.inspectAcquisition(s.access, f.input.acquisition), {
    kind: 'acquired',
    adoption: a.adoption,
  })
}

async function checkUndeclaredKeyIsRefused<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const requirement = { ...f.requirement, facilities: ['terminal'] as const }
  assert.deepEqual(
    await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement }),
    { kind: 'rejected', reason: 'missingFacility' },
  )
  assert.deepEqual(
    await s.environment.acquire(s.access, {
      ...f.input,
      placement: { ...f.placement, requirement },
    }),
    { kind: 'rejected', reason: 'unsupportedFacility' },
  )
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkLeaseExposesOnlyRequirementKeys<P>(
  _s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  assert.equal((await f.acquired()).lease.facility('terminal'), undefined)
}

async function checkGuardedOperationAsksGuard<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  for (const answer of ['notAuthorized', 'unavailable', 'authorized'] as const) {
    const guard = createScriptedFacilityGuard<P>(answer)
    const a = await s.environment.acquire(s.access, {
      ...f.input,
      acquisition: acquisitionRef(answer),
      guard,
    })
    assert.equal(a.kind, 'acquired')
    if (a.kind !== 'acquired') return
    const before = f.provider.calls.start
    const result = await commandOf(a).start(commandRequest(s, f))
    assert.equal(guard.calls.length, 1)
    if (answer !== 'authorized') {
      assert.deepEqual(result, { kind: 'rejected', requestId: 'suite-start', reason: answer })
      assert.equal(f.provider.calls.start, before)
    } else assert.equal(f.provider.calls.start, before + 1)
  }
}

async function checkOriginalCallMismatchIsInvalidInput<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired()
  assert.deepEqual(
    await commandOf(a).start({ ...commandRequest(s, f), origin: originRef('other-origin') }),
    { kind: 'rejected', requestId: 'suite-start', reason: 'invalidInput' },
  )
  assert.equal(f.guard.calls.length, 0)
  assert.equal(f.provider.calls.start, 0)
}

async function checkSecondDeclarationIsRefused<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  assert.throws(() =>
    s.environment.registerFacility(describeFacility('command', { start: 'open' })),
  )
  const a = await f.acquired()
  await commandOf(a).start(commandRequest(s, f))
  assert.equal(f.guard.calls.length, 1)
}

async function checkRemovedDeclarationRefusesHeldFacility<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const held = commandOf(await f.acquired())
  await f.removeFacility()
  assert.deepEqual(await held.start(commandRequest(s, f)), {
    kind: 'rejected',
    requestId: 'suite-start',
    reason: 'unsupported',
  })
  assert.equal(f.provider.calls.start, 0)
}

async function checkRequesterScopeFiltersDescribe<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  await f.acquired()
  const list = await s.environment.describe(s.access, s.scope)
  assert.ok(Array.isArray(list))
  assert.equal(list.length, 1)
  const otherScope = anotherScope(s.scope)
  assert.deepEqual(await s.environment.describe(s.access, otherScope), [])
  if (s.otherAccess) assert.deepEqual(await s.environment.describe(s.otherAccess, s.scope), [])
}

async function checkSandboxScopeMustEqualRequester<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const binding: EnvironmentBinding = { kind: 'session_sandbox', scope: anotherScope(s.scope) }
  const requirement = { ...f.requirement, allowedBindings: [binding] }
  assert.deepEqual(
    await s.environment.resolvePlacement(s.access, { scope: s.scope, requirement }),
    { kind: 'rejected', reason: 'invalidInput' },
  )
  assert.deepEqual(
    await s.environment.acquire(s.access, {
      ...f.input,
      placement: { ...f.placement, binding, requirement },
    }),
    { kind: 'rejected', reason: 'invalidInput' },
  )
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkDescribeAfterCloseIsOwnerStopped<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  if (!s.hooks?.close) throw new NotApplicable('requires owner close hook')
  await s.hooks.close()
  assert.deepEqual(await s.environment.describe(s.access, s.scope), {
    kind: 'rejected',
    reason: 'ownerStopped',
  })
}

async function checkClosedLedgerBlocksNewOperation<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired()
  f.ledger.close()
  assert.deepEqual(await commandOf(a).start(commandRequest(s, f)), {
    kind: 'rejected',
    requestId: 'suite-start',
    reason: 'closed',
  })
  assert.equal(f.provider.calls.start, 0)
}

async function checkUnmintedTenantIsInvalidInput<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const forged = { ...s.access, tenant: { ...s.access.tenant } }
  assert.deepEqual(
    await s.environment.resolvePlacement(forged, {
      scope: s.scope,
      requirement: f.requirement,
    }),
    { kind: 'rejected', reason: 'invalidInput' },
  )
  assert.deepEqual(await s.environment.acquire(forged, f.input), {
    kind: 'rejected',
    reason: 'invalidInput',
  })
  assert.deepEqual(await s.environment.describe(forged, s.scope), {
    kind: 'rejected',
    reason: 'invalidInput',
  })
  assert.deepEqual(await s.environment.inspectAcquisition(forged, f.input.acquisition), {
    kind: 'invalidInput',
  })
  assert.deepEqual(await s.environment.inspectAcquisition(s.access, f.input.acquisition), {
    kind: 'unrecorded',
  })
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkRemovalStartsRetirement<P>(
  _s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired()
  await f.removeProvider()
  assert.equal(f.provider.calls.retire, 1)
  assert.deepEqual(await a.lease.invalidated, { source: 'registry', reason: 'providerRetired' })
  assert.deepEqual(
    await _s.environment.acquire(_s.access, {
      ...f.input,
      acquisition: acquisitionRef('after-retirement'),
    }),
    { kind: 'rejected', reason: 'providerUnavailable' },
  )
}

async function checkPendingRetirementIsNotCompletion<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  let n = 0
  const f = await setupEnvironmentFixture(s, {
    retire: async () => (++n === 1 ? { kind: 'pending', resources: [] } : { kind: 'drained' }),
  })
  await assert.rejects(f.removeProvider())
  await f.removeProvider()
  assert.equal(f.provider.calls.retire, 2)
}

async function checkParamsSchemaRefusalHasItemReasons<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const result = await acquireParamsSchema['~standard'].validate([
    s.access,
    { ...f.input, origin: '' },
  ])
  assert.ok(result.issues)
  assert.deepEqual(result.issues[0]?.path, [1, 'origin'])
}

export function executionEnvironmentConformance<P>(
  options: EnvironmentConformanceOptions<P>,
): readonly ConformanceCase[] {
  return [
    environmentCase(
      options,
      'V-EE05.adoption-issued-from-verified-receipt',
      checkAdoptionIssuedFromVerifiedReceipt,
    ),
    environmentCase(
      options,
      'V-EE05.mismatched-receipt-binding-is-refused',
      checkMismatchedReceiptBindingIsRefused,
    ),
    environmentCase(
      options,
      'V-EE05.receipt-missing-facility-is-refused',
      checkReceiptMissingFacilityIsRefused,
    ),
    fixtureCase(
      options,
      'V-EE19.repeat-key-returns-same-acquisition',
      checkRepeatKeyReturnsSameAcquisition,
    ),
    fixtureCase(
      options,
      'V-EE19.different-placement-same-key-is-conflict',
      checkDifferentPlacementSameKeyIsConflict,
    ),
    fixtureCase(options, 'V-EE19.other-tenant-does-not-see-key', checkOtherTenantDoesNotSeeKey),
    fixtureCase(options, 'V-EE20.undeclared-key-is-refused', checkUndeclaredKeyIsRefused),
    fixtureCase(
      options,
      'V-EE20.lease-exposes-only-requirement-keys',
      checkLeaseExposesOnlyRequirementKeys,
    ),
    fixtureCase(options, 'V-EE20.guarded-operation-asks-guard', checkGuardedOperationAsksGuard),
    fixtureCase(
      options,
      'V-EE20.original-call-mismatch-is-invalid-input',
      checkOriginalCallMismatchIsInvalidInput,
    ),
    fixtureCase(options, 'V-EE20.second-declaration-is-refused', checkSecondDeclarationIsRefused),
    fixtureCase(
      options,
      'V-EE20.removed-declaration-refuses-held-facility',
      checkRemovedDeclarationRefusesHeldFacility,
    ),
    fixtureCase(
      options,
      'V-EE22.requester-scope-filters-describe',
      checkRequesterScopeFiltersDescribe,
    ),
    fixtureCase(
      options,
      'V-EE22.sandbox-scope-must-equal-requester',
      checkSandboxScopeMustEqualRequester,
    ),
    fixtureCase(
      options,
      'V-EE22.describe-after-close-is-owner-stopped',
      checkDescribeAfterCloseIsOwnerStopped,
    ),
    fixtureCase(
      options,
      'V-EE22.closed-ledger-blocks-new-operation',
      checkClosedLedgerBlocksNewOperation,
    ),
    fixtureCase(
      options,
      'V-EE22.unminted-tenant-is-invalid-input',
      checkUnmintedTenantIsInvalidInput,
    ),
    fixtureCase(options, 'V-EE18.removal-starts-retirement', checkRemovalStartsRetirement),
    environmentCase(
      options,
      'V-EE18.pending-retirement-is-not-completion',
      checkPendingRetirementIsNotCompletion,
    ),
    fixtureCase(
      options,
      'V-EE22.params-schema-refusal-has-item-reasons',
      checkParamsSchemaRefusalHasItemReasons,
    ),
  ]
}
