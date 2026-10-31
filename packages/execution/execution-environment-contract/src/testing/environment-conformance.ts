import assert from 'node:assert/strict'
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  originRef,
  commandFacility,
  describeFacility,
  acquireParamsSchema,
  type Access,
  type AcquireInput,
  type Acquired,
  type AcquisitionQuery,
  type EnvironmentAuthority,
  type ExecutionEnvironment,
  type OriginalAcquisition,
  type ProviderRegistrations,
  type EnvironmentRequirement,
  type ProviderAcquireInput,
  type EnvironmentBinding,
  type RecoveryAccess,
} from '../index.ts'
import {
  createMemoryResourceLedger,
  createScriptedEnvironmentAuthority,
  createScriptedEnvironmentProvider,
  createScriptedFacilityGuard,
  createScriptedScopeBindings,
  type ScriptedEnvironmentAuthority,
  type ScriptedScopeBindings,
} from './doubles.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'

/** The two needed ports the suite gives the subject. The suite keeps the scripted control. */
export type EnvironmentConformancePorts<P> = Readonly<{
  authority: EnvironmentAuthority<P>
  bindings: ScopeBindingSource
}>
export type EnvironmentConformanceSubject<P> = Readonly<{
  environment: ExecutionEnvironment<P> & ProviderRegistrations
  access: Access<P>
  otherAccess?: Access<P>
  scope: ProviderAcquireInput['scope']
  /** A recovery access the subject's recovery authority accepts. Recovery cases need it. */
  recoveryAccess?: RecoveryAccess
  hooks?: { close?(): Promise<void> }
  dispose?(): Promise<void>
}>
export type EnvironmentConformanceOptions<P> = Readonly<{
  /** Builds the subject on the given ports; the suite binds `scope` to the tenant of `access`. */
  subject(
    ports: EnvironmentConformancePorts<P>,
  ): EnvironmentConformanceSubject<P> | Promise<EnvironmentConformanceSubject<P>>
  waitMs?: number
}>
type Ports<P> = Readonly<{
  authority: ScriptedEnvironmentAuthority<P>
  bindings: ScriptedScopeBindings
}>
type EnvironmentFixture<P> = Awaited<ReturnType<typeof setupEnvironmentFixture<P>>>
const host: EnvironmentBinding = { kind: 'host_machine' }
function anotherScope<P>(
  scope: EnvironmentConformanceSubject<P>['scope'],
  suffix = '-other',
): EnvironmentConformanceSubject<P>['scope'] {
  const ref = scope.ref + suffix
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
  const original: OriginalAcquisition = {
    tenant: s.access.tenant,
    acquisition: input.acquisition,
    origin: input.origin,
    scope: input.scope,
    placement: resolved,
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
    original,
    acquire,
    acquired,
  }
}
function environmentCase<P>(
  options: EnvironmentConformanceOptions<P>,
  name: string,
  run: (s: EnvironmentConformanceSubject<P>, ports: Ports<P>) => Promise<void>,
): ConformanceCase {
  return {
    name,
    async run() {
      const ports: Ports<P> = {
        authority: createScriptedEnvironmentAuthority<P>(),
        bindings: createScriptedScopeBindings(),
      }
      const s = await options.subject(ports)
      ports.bindings.bind(s.scope, s.access.tenant)
      ports.bindings.bind(anotherScope(s.scope), s.access.tenant)
      try {
        await bounded(run(s, ports), options.waitMs ?? 1000)
      } finally {
        await s.dispose?.()
      }
    },
  }
}
function fixtureCase<P>(
  options: EnvironmentConformanceOptions<P>,
  name: string,
  run: (
    s: EnvironmentConformanceSubject<P>,
    f: EnvironmentFixture<P>,
    ports: Ports<P>,
  ) => Promise<void>,
): ConformanceCase {
  return environmentCase(options, name, async (s, ports) =>
    run(s, await setupEnvironmentFixture(s), ports),
  )
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
const local = (acquisition: AcquireInput<unknown>['acquisition']): AcquisitionQuery => ({
  kind: 'local',
  acquisition,
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

async function checkMismatchedReceiptBindingFailsAdoption<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, {
    receiptBinding: { kind: 'session_sandbox', scope: s.scope },
  })
  assert.deepEqual(await f.acquire(), {
    kind: 'allocationFailed',
    acquisition: f.input.acquisition,
    reason: 'unavailable',
    cleanup: { kind: 'settled' },
  })
  assert.equal(f.provider.calls.release, 1)
}

async function checkReceiptMissingFacilityFailsAdoption<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, { lease: {} })
  assert.deepEqual(await f.acquire(), {
    kind: 'allocationFailed',
    acquisition: f.input.acquisition,
    reason: 'unsupportedFacility',
    cleanup: { kind: 'settled' },
  })
  assert.equal(f.provider.calls.release, 1)
}

async function checkFailedAdoptionKeepsReasonAndSlot<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, {
    lease: {},
    release: async () => ({ kind: 'pending', resources: [] }),
  })
  const first = await f.acquire()
  assert.deepEqual(first, {
    kind: 'allocationFailed',
    acquisition: f.input.acquisition,
    reason: 'unsupportedFacility',
    cleanup: { kind: 'pending' },
  })
  const again = await f.acquire()
  assert.equal(again.kind, 'allocationFailed')
  if (again.kind === 'allocationFailed') assert.equal(again.reason, 'unsupportedFacility')
  assert.equal(f.provider.calls.acquire, 1)
  const seen = await s.environment.inspectAcquisition(s.access, local(f.input.acquisition))
  assert.equal(seen.kind, 'known')
  if (seen.kind === 'known') {
    assert.equal(seen.state.kind, 'allocationFailed')
    if (seen.state.kind === 'allocationFailed')
      assert.equal(seen.state.reason, 'unsupportedFacility')
  }
}

async function checkRevokedAccessFailsAdoption<P>(
  s: EnvironmentConformanceSubject<P>,
  ports: Ports<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, { beforeAcquire: () => ports.authority.revokeAll() })
  const result = await f.acquire()
  assert.equal(result.kind, 'allocationFailed')
  if (result.kind === 'allocationFailed') assert.equal(result.reason, 'notAuthorized')
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

async function checkDifferentFingerprintSameKeyIsConflict<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  await f.acquired()
  for (const changed of [
    {
      ...f.input,
      placement: { ...f.placement, binding: { kind: 'session_sandbox', scope: s.scope } },
    },
    { ...f.input, origin: originRef('suite-other-origin') },
    { ...f.input, placement: { ...f.placement, quotaDomain: 'suite-other-domain' } },
    { ...f.input, ledger: createMemoryResourceLedger().ledger },
  ] satisfies AcquireInput<P>[])
    assert.deepEqual(await s.environment.acquire(s.access, changed), {
      kind: 'rejected',
      reason: 'acquisitionConflict',
    })
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkOtherTenantDoesNotSeeKey<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
  ports: Ports<P>,
): Promise<void> {
  const other = s.otherAccess
  if (!other) throw new NotApplicable('requires another tenant')
  const a = await f.acquired()
  assert.deepEqual(await s.environment.inspectAcquisition(other, local(f.input.acquisition)), {
    kind: 'unrecorded',
  })
  const ownScope = anotherScope(s.scope, '-tenant-b')
  ports.bindings.bind(ownScope, other.tenant)
  const placed = await s.environment.resolvePlacement(other, {
    scope: ownScope,
    requirement: f.requirement,
  })
  assert.equal(placed.kind, 'placement')
  if (placed.kind !== 'placement') return
  const b = await s.environment.acquire(other, { ...f.input, scope: ownScope, placement: placed })
  assert.equal(b.kind, 'acquired')
  assert.equal(f.provider.calls.acquire, 2)
  assert.deepEqual(await s.environment.inspectAcquisition(s.access, local(f.input.acquisition)), {
    kind: 'known',
    state: { kind: 'acquired', adoption: a.adoption },
  })
}

async function checkOtherTenantScopeIsNotAuthorized<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const other = s.otherAccess
  if (!other) throw new NotApplicable('requires another tenant')
  const refused = { kind: 'rejected', reason: 'notAuthorized' }
  assert.deepEqual(
    await s.environment.resolvePlacement(other, { scope: s.scope, requirement: f.requirement }),
    refused,
  )
  assert.deepEqual(await s.environment.acquire(other, f.input), refused)
  assert.deepEqual(await s.environment.describe(other, s.scope), refused)
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkUnboundScopeIsNotAuthorized<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const unbound = anotherScope(s.scope, '-unbound')
  assert.deepEqual(
    await s.environment.resolvePlacement(s.access, { scope: unbound, requirement: f.requirement }),
    { kind: 'rejected', reason: 'notAuthorized' },
  )
  assert.deepEqual(await s.environment.acquire(s.access, { ...f.input, scope: unbound }), {
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkAuthorityAnswersMapWithoutAllocation<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
  ports: Ports<P>,
): Promise<void> {
  const placement = { scope: s.scope, requirement: f.requirement }
  ports.authority.script(() => ({ kind: 'refused' }))
  assert.deepEqual(await s.environment.resolvePlacement(s.access, placement), {
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'notAuthorized' })
  ports.authority.script(() => ({ kind: 'unavailable' }))
  assert.deepEqual(await s.environment.resolvePlacement(s.access, placement), {
    kind: 'rejected',
    reason: 'unavailable',
  })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unavailable' })
  ports.authority.script(() => ({ kind: 'unknown' }))
  assert.deepEqual(await s.environment.resolvePlacement(s.access, placement), {
    kind: 'unknown',
    cause: 'authority',
  })
  assert.deepEqual(await f.acquire(), {
    kind: 'unknown',
    acquisition: f.input.acquisition,
    phase: 'preflight',
  })
  assert.equal(f.provider.calls.acquire, 0)
  ports.authority.script(undefined)
  assert.equal((await f.acquire()).kind, 'acquired')
}

async function checkBindingAnswersMapWithoutAllocation<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
  ports: Ports<P>,
): Promise<void> {
  ports.bindings.answer(s.scope, { kind: 'unavailable' })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unavailable' })
  assert.deepEqual(await s.environment.describe(s.access, s.scope), {
    kind: 'rejected',
    reason: 'unavailable',
  })
  ports.bindings.answer(s.scope, { kind: 'unknown' })
  assert.deepEqual(await s.environment.describe(s.access, s.scope), {
    kind: 'unknown',
    cause: 'scope-binding',
  })
  assert.deepEqual(await f.acquire(), {
    kind: 'unknown',
    acquisition: f.input.acquisition,
    phase: 'preflight',
  })
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkQuotaPreflightAnswersMap<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  let answer: 'unavailable' | 'unknown' = 'unavailable'
  const f = await setupEnvironmentFixture(s, { quota: async () => ({ kind: answer }) })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'unavailable' })
  answer = 'unknown'
  assert.deepEqual(await f.acquire(), {
    kind: 'unknown',
    acquisition: f.input.acquisition,
    phase: 'preflight',
  })
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkQuotaRefusalIsFinal<P>(s: EnvironmentConformanceSubject<P>): Promise<void> {
  const f = await setupEnvironmentFixture(s, {
    acquire: async () => ({ kind: 'rejected', reason: 'quotaExceeded' }),
  })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'quotaExceeded' })
  assert.deepEqual(await f.acquire(), { kind: 'rejected', reason: 'quotaExceeded' })
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkLostResponseIsQueriedNotResent<P>(
  s: EnvironmentConformanceSubject<P>,
): Promise<void> {
  let lose = true
  const f = await setupEnvironmentFixture(s, {
    afterAcquire: async (_input, receipt) => {
      if (!lose) return receipt
      lose = false
      throw new Error('response lost')
    },
  })
  assert.deepEqual(await f.acquire(), {
    kind: 'unknown',
    acquisition: f.input.acquisition,
    phase: 'allocation',
  })
  const seen = await s.environment.inspectAcquisition(s.access, local(f.input.acquisition))
  assert.deepEqual(seen, { kind: 'known', state: { kind: 'provisional' } })
  assert.ok(f.provider.calls.inspect >= 1)
  const adopted = await f.acquire()
  assert.equal(adopted.kind, 'acquired')
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkOriginalQueryNeverAdopts<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired()
  const answer = await s.environment.inspectAcquisition(s.access, {
    kind: 'original',
    original: f.original,
  })
  assert.equal(answer.kind, 'original')
  if (answer.kind !== 'original') return
  assert.equal(answer.status, 'allocated')
  assert.equal('lease' in answer, false)
  if (answer.status === 'allocated')
    assert.ok(answer.adoption === null || answer.adoption === a.adoption)
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkOriginalOfOtherTenantIsNotAuthorized<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const other = s.otherAccess
  if (!other) throw new NotApplicable('requires another tenant')
  await f.acquired()
  const asked = f.provider.calls.inspect
  assert.deepEqual(
    await s.environment.inspectAcquisition(other, { kind: 'original', original: f.original }),
    { kind: 'refused', reason: 'notAuthorized' },
  )
  assert.equal(f.provider.calls.inspect, asked)
}

/** Rule 3 alone: the scope is the caller's own, but the description names another tenant. */
async function checkOriginalNamingAnotherTenantIsNotAuthorized<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
  ports: Ports<P>,
): Promise<void> {
  const other = s.otherAccess
  if (!other) throw new NotApplicable('requires another tenant')
  await f.acquired()
  const ownScope = anotherScope(s.scope, '-tenant-b')
  ports.bindings.bind(ownScope, other.tenant)
  const asked = f.provider.calls.inspect
  const claimed: OriginalAcquisition = { ...f.original, scope: ownScope }
  assert.deepEqual(
    await s.environment.inspectAcquisition(other, { kind: 'original', original: claimed }),
    { kind: 'refused', reason: 'notAuthorized' },
  )
  assert.equal(f.provider.calls.inspect, asked)
}

/** A revocation while the provider answers an original query withholds the answer. */
async function checkRevokedDuringOriginalQueryIsNotDisclosed<P>(
  s: EnvironmentConformanceSubject<P>,
  ports: Ports<P>,
): Promise<void> {
  const f = await setupEnvironmentFixture(s, {
    inspect: async () => {
      ports.authority.revokeAll()
      return { kind: 'notAllocated' }
    },
  })
  assert.deepEqual(
    await s.environment.inspectAcquisition(s.access, { kind: 'original', original: f.original }),
    { kind: 'refused', reason: 'notAuthorized' },
  )
  assert.equal(f.provider.calls.inspect, 1)
}

async function checkRecoveryQueryAnswersOriginal<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  if (!s.recoveryAccess) throw new NotApplicable('requires a recovery access')
  await f.acquired()
  const answer = await s.environment.inspectRecoveryAcquisition(s.recoveryAccess, f.original)
  assert.equal(answer.kind, 'original')
  if (answer.kind === 'original') assert.equal(answer.status, 'allocated')
  assert.equal(f.provider.calls.acquire, 1)
}

async function checkRecoverySettlesAcquisitionsWithoutClaimingRelease<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  if (!s.recoveryAccess) throw new NotApplicable('requires a recovery access')
  await f.acquired()
  const result = await s.environment.releaseScope(s.scope, s.recoveryAccess)
  assert.equal(result.kind, 'recovered')
  if (result.kind !== 'recovered') return
  assert.deepEqual(
    result.settledAcquisitions.map(item => [item.original.acquisition, item.outcome]),
    [[f.input.acquisition, 'settled']],
  )
  // The scripted provider has no resource recovery: the resource path is unsupported, not empty.
  assert.equal(result.unsupported.length, 1)
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
  if (s.otherAccess)
    assert.deepEqual(await s.environment.describe(s.otherAccess, s.scope), {
      kind: 'rejected',
      reason: 'notAuthorized',
    })
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
  ports: Ports<P>,
): Promise<void> {
  const forged = { ...s.access, tenant: { ...s.access.tenant } }
  const asked = ports.authority.calls.length
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
  assert.deepEqual(await s.environment.inspectAcquisition(forged, local(f.input.acquisition)), {
    kind: 'invalidInput',
  })
  assert.equal(ports.authority.calls.length, asked)
  assert.deepEqual(await s.environment.inspectAcquisition(s.access, local(f.input.acquisition)), {
    kind: 'unrecorded',
  })
  assert.equal(f.provider.calls.acquire, 0)
}

async function checkRemovalStartsRetirement<P>(
  s: EnvironmentConformanceSubject<P>,
  f: EnvironmentFixture<P>,
): Promise<void> {
  const a = await f.acquired()
  await f.removeProvider()
  assert.equal(f.provider.calls.retire, 1)
  assert.deepEqual(await a.lease.invalidated, { source: 'registry', reason: 'providerRetired' })
  assert.deepEqual(
    await s.environment.acquire(s.access, {
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
      'V-EE05.mismatched-receipt-binding-fails-adoption',
      checkMismatchedReceiptBindingFailsAdoption,
    ),
    environmentCase(
      options,
      'V-EE05.receipt-missing-facility-fails-adoption',
      checkReceiptMissingFacilityFailsAdoption,
    ),
    environmentCase(
      options,
      'V-EE24.failed-adoption-keeps-reason-and-slot',
      checkFailedAdoptionKeepsReasonAndSlot,
    ),
    environmentCase(
      options,
      'V-EE24.revoked-access-fails-adoption',
      checkRevokedAccessFailsAdoption,
    ),
    fixtureCase(
      options,
      'V-EE19.repeat-key-returns-same-acquisition',
      checkRepeatKeyReturnsSameAcquisition,
    ),
    fixtureCase(
      options,
      'V-EE19.different-fingerprint-same-key-is-conflict',
      checkDifferentFingerprintSameKeyIsConflict,
    ),
    fixtureCase(options, 'V-EE19.other-tenant-does-not-see-key', checkOtherTenantDoesNotSeeKey),
    fixtureCase(
      options,
      'V-EE04.other-tenant-scope-is-not-authorized',
      checkOtherTenantScopeIsNotAuthorized,
    ),
    fixtureCase(
      options,
      'V-EE04.unbound-scope-is-not-authorized',
      checkUnboundScopeIsNotAuthorized,
    ),
    fixtureCase(
      options,
      'V-EE04.authority-answers-map-without-allocation',
      checkAuthorityAnswersMapWithoutAllocation,
    ),
    fixtureCase(
      options,
      'V-EE04.binding-answers-map-without-allocation',
      checkBindingAnswersMapWithoutAllocation,
    ),
    environmentCase(options, 'V-EE25.quota-preflight-answers-map', checkQuotaPreflightAnswersMap),
    environmentCase(options, 'V-EE25.quota-refusal-is-final', checkQuotaRefusalIsFinal),
    environmentCase(
      options,
      'V-EE23.lost-response-is-queried-not-resent',
      checkLostResponseIsQueriedNotResent,
    ),
    fixtureCase(options, 'V-EE23.original-query-never-adopts', checkOriginalQueryNeverAdopts),
    fixtureCase(
      options,
      'V-EE04.original-of-other-tenant-is-not-authorized',
      checkOriginalOfOtherTenantIsNotAuthorized,
    ),
    fixtureCase(
      options,
      'V-EE04.original-naming-another-tenant-is-not-authorized',
      checkOriginalNamingAnotherTenantIsNotAuthorized,
    ),
    environmentCase(
      options,
      'V-EE04.revoked-during-original-query-is-not-disclosed',
      checkRevokedDuringOriginalQueryIsNotDisclosed,
    ),
    fixtureCase(
      options,
      'V-EE23.recovery-query-answers-original',
      checkRecoveryQueryAnswersOriginal,
    ),
    fixtureCase(
      options,
      'V-EE26.recovery-settles-acquisitions-without-claiming-release',
      checkRecoverySettlesAcquisitionsWithoutClaimingRelease,
    ),
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
