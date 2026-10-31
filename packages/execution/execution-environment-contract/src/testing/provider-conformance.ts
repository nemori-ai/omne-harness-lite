import assert from 'node:assert/strict'
import {
  acquisitionRef,
  originRef,
  providerFactsSchema,
  managedResourceSchema,
  type EnvironmentProvider,
  type EnvironmentLease,
  type FacilityResult,
  type EnvironmentBinding,
  type ProviderAcquireInput,
  type FacilityKey,
  type OriginalAcquisition,
} from '../index.ts'
import { createMemoryResourceLedger } from './doubles.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'
export type ProviderConformanceSubject = Readonly<{
  provider: EnvironmentProvider
  binding: EnvironmentBinding
  scope: ProviderAcquireInput['scope']
  tenant: ProviderAcquireInput['tenant']
  facility: FacilityKey
  hooks?: {
    /** Prepares a legal operation on an already-held facility and observes its external effects. */
    prepareHeldOperation?(
      context: Readonly<{ lease: EnvironmentLease; input: ProviderAcquireInput }>,
    ): Promise<{
      run(): Promise<FacilityResult<unknown>>
      effectSnapshot(): Promise<unknown>
    }>

    holdNextOperation?(): Promise<{
      entered: Promise<void>
      release(): void
      operation(): Promise<unknown>
    }>
  }
  dispose?(): Promise<void>
}>
export type ProviderConformanceOptions = Readonly<{
  subject(): ProviderConformanceSubject | Promise<ProviderConformanceSubject>
  waitMs?: number
}>
function providerInput(s: ProviderConformanceSubject): ProviderAcquireInput {
  return {
    acquisition: acquisitionRef('suite-acquisition'),
    origin: originRef('suite-origin'),
    scope: s.scope,
    tenant: s.tenant,
    ledger: createMemoryResourceLedger().ledger,
    placement: {
      kind: 'placement',
      requirement: { allowedBindings: [s.binding], facilities: [s.facility], isolation: [] },
      binding: s.binding,
      provider: {
        name: s.provider.name,
        generation: s.provider.generation,
        version: s.provider.version,
      },
      continuity: s.provider.continuity,
      quotaDomain: s.provider.quotaDomain,
    },
  }
}
function originalOf(input: ProviderAcquireInput): OriginalAcquisition {
  return {
    tenant: input.tenant,
    acquisition: input.acquisition,
    origin: input.origin,
    scope: input.scope,
    placement: input.placement,
  }
}

function providerCase(
  options: ProviderConformanceOptions,
  name: string,
  run: (s: ProviderConformanceSubject, input: ProviderAcquireInput) => Promise<void>,
): ConformanceCase {
  return {
    name,
    async run() {
      const s = await options.subject()
      try {
        const input = providerInput(s)
        await bounded(run(s, input), options.waitMs ?? 1000)
      } finally {
        await s.dispose?.()
      }
    },
  }
}

async function checkFactsMatchDeclaration({ provider }: ProviderConformanceSubject): Promise<void> {
  const facts = await provider.describe()
  assert.ok(!('issues' in (await providerFactsSchema['~standard'].validate(facts))))
  assert.deepEqual(
    {
      provider: facts.provider,
      generation: facts.generation,
      version: facts.version,
      facilities: [...new Set(facts.facilities)].sort(),
      isolation: [...new Set(facts.isolation)].sort(),
    },
    {
      provider: provider.name,
      generation: provider.generation,
      version: provider.version,
      facilities: [...new Set(provider.facilities)].sort(),
      isolation: [...new Set(provider.isolation)].sort(),
    },
  )
}

async function checkRefusesAfterRetire(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  await provider.retire()
  assert.deepEqual(await provider.acquire(input), {
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
}

async function checkHeldFacilityRefusesNewOperationsAfterRetire(
  s: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  if (!s.hooks?.prepareHeldOperation)
    throw new NotApplicable('requires a legal held-facility operation and effect observation hook')
  const receipt = await s.provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    const operation = await s.hooks.prepareHeldOperation({ lease: receipt.lease, input })
    const before = await operation.effectSnapshot()
    await s.provider.retire()
    const result = await operation.run()
    assert.equal(result.kind, 'rejected')
    if (result.kind === 'rejected') assert.equal(result.reason, 'closed')
    assert.deepEqual(await operation.effectSnapshot(), before)
  } finally {
    await receipt.lease.release()
  }
}

async function checkRetireReportsDrainedOrPending({
  provider,
}: ProviderConformanceSubject): Promise<void> {
  const answer = await provider.retire()
  assert.ok(answer.kind === 'drained' || answer.kind === 'pending')
  if (answer.kind === 'pending')
    for (const r of answer.resources)
      assert.ok(!('issues' in (await managedResourceSchema['~standard'].validate(r))))
}

async function checkRetireIsRetryable({ provider }: ProviderConformanceSubject): Promise<void> {
  await provider.retire()
  const again = await provider.retire()
  assert.ok(again.kind === 'drained' || again.kind === 'pending')
}

async function checkRetireWaitsForInFlight(s: ProviderConformanceSubject): Promise<void> {
  if (!s.hooks?.holdNextOperation)
    throw new NotApplicable('requires an in-flight operation control hook')
  const hold = await s.hooks.holdNextOperation()
  const operation = hold.operation()
  await hold.entered
  let settled = false
  const retirement = s.provider.retire().then(result => {
    settled = true
    return result
  })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false)
  } finally {
    hold.release()
  }
  await operation
  assert.equal((await retirement).kind, 'drained')
}

async function checkReceiptIsProvisional(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    assert.equal('adoption' in receipt, false)
    assert.deepEqual(receipt.lease.placement, input.placement)
    assert.ok(
      !(
        'issues' in
        (await managedResourceSchema['~standard'].validate({
          key: 'evidence',
          provider: provider.name,
          reference: receipt.evidence,
        }))
      ),
    )
  } finally {
    await receipt.lease.release()
  }
}

async function checkLeaseExposesOnlyDeclaredKeys(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    for (const key of ['files', 'command', 'terminal'] as const)
      if (!provider.facilities.includes(key)) assert.equal(receipt.lease.facility(key), undefined)
  } finally {
    await receipt.lease.release()
  }
}

async function checkReleaseIsRetryable(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  for (let n = 0; n < 2; n++) {
    const released = await receipt.lease.release()
    assert.ok(released.kind === 'released' || released.kind === 'pending')
  }
}

async function checkFactsSchemaRefusalHasItemReasons({
  provider,
}: ProviderConformanceSubject): Promise<void> {
  const result = await providerFactsSchema['~standard'].validate({
    ...(await provider.describe()),
    prerequisites: 'maybe',
  })
  assert.ok(result.issues)
  assert.deepEqual(result.issues[0]?.path, ['prerequisites'])
}

async function checkQuotaDeclarationHasBounds(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const answer = await provider.quota(input.tenant)
  if (answer.kind !== 'declared') return
  const { perTenant, global } = answer.quota
  assert.equal(answer.quota.unit, 'unsettled-acquisition')
  assert.ok(Number.isSafeInteger(perTenant) && perTenant >= 0)
  assert.ok(global === null || (Number.isSafeInteger(global) && global >= 0))
}

async function checkInspectFindsHeldAcquisition(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    const answer = await provider.inspectAcquisition(originalOf(input))
    assert.equal(answer.kind, 'acquired')
  } finally {
    await receipt.lease.release()
  }
}

async function checkInspectNeverInventsAllocation(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const answer = await provider.inspectAcquisition({
    ...originalOf(input),
    acquisition: acquisitionRef('suite-never-acquired'),
  })
  assert.ok(['notAllocated', 'unavailable', 'unknown'].includes(answer.kind))
}

async function checkDifferentDescriptionIsConflict(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    const other = { ...originalOf(input), origin: originRef('suite-other-origin') }
    assert.equal((await provider.inspectAcquisition(other)).kind, 'conflict')
    assert.equal((await provider.settleAcquisition(other)).kind, 'conflict')
    assert.equal((await provider.inspectAcquisition(originalOf(input))).kind, 'acquired')
  } finally {
    await receipt.lease.release()
  }
}

async function checkListIncludesOpenAcquisition(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  try {
    const listing = await provider.listAcquisitions(input.scope)
    assert.equal(listing.kind, 'listed')
    if (listing.kind !== 'listed') return
    assert.ok(listing.acquisitions.some(a => a.acquisition === input.acquisition))
  } finally {
    await receipt.lease.release()
  }
}

async function checkSettleIsIdempotentAndNeverRewritesAllocation(
  { provider }: ProviderConformanceSubject,
  input: ProviderAcquireInput,
): Promise<void> {
  const receipt = await provider.acquire(input)
  assert.equal(receipt.kind, 'acquired')
  if (receipt.kind !== 'acquired') return
  const first = await provider.settleAcquisition(originalOf(input))
  assert.ok(first.kind === 'settled' || first.kind === 'pending')
  if (first.kind !== 'settled') return
  assert.deepEqual(await provider.settleAcquisition(originalOf(input)), { kind: 'settled' })
  const after = await provider.inspectAcquisition(originalOf(input))
  assert.equal(after.kind, 'settled')
  const listing = await provider.listAcquisitions(input.scope)
  if (listing.kind === 'listed')
    assert.ok(!listing.acquisitions.some(a => a.acquisition === input.acquisition))
}

export function environmentProviderConformance(
  options: ProviderConformanceOptions,
): readonly ConformanceCase[] {
  return [
    providerCase(options, 'V-EE18.facts-match-declaration', checkFactsMatchDeclaration),
    providerCase(options, 'V-EE18.refuses-after-retire', checkRefusesAfterRetire),
    providerCase(
      options,
      'V-EE18.held-facility-refuses-new-operations-after-retire',
      checkHeldFacilityRefusesNewOperationsAfterRetire,
    ),
    providerCase(
      options,
      'V-EE18.retire-reports-drained-or-pending',
      checkRetireReportsDrainedOrPending,
    ),
    providerCase(options, 'V-EE18.retire-is-retryable', checkRetireIsRetryable),
    providerCase(options, 'V-EE18.retire-waits-for-in-flight', checkRetireWaitsForInFlight),
    providerCase(options, 'V-EE05.receipt-is-provisional', checkReceiptIsProvisional),
    providerCase(
      options,
      'V-EE20.lease-exposes-only-declared-keys',
      checkLeaseExposesOnlyDeclaredKeys,
    ),
    providerCase(options, 'V-EE13.release-is-retryable', checkReleaseIsRetryable),
    providerCase(
      options,
      'V-EE22.facts-schema-refusal-has-item-reasons',
      checkFactsSchemaRefusalHasItemReasons,
    ),
    providerCase(options, 'V-EE25.quota-declaration-has-bounds', checkQuotaDeclarationHasBounds),
    providerCase(
      options,
      'V-EE23.inspect-finds-held-acquisition',
      checkInspectFindsHeldAcquisition,
    ),
    providerCase(
      options,
      'V-EE23.inspect-never-invents-allocation',
      checkInspectNeverInventsAllocation,
    ),
    providerCase(
      options,
      'V-EE23.different-description-is-conflict',
      checkDifferentDescriptionIsConflict,
    ),
    providerCase(
      options,
      'V-EE26.list-includes-open-acquisition',
      checkListIncludesOpenAcquisition,
    ),
    providerCase(
      options,
      'V-EE25.settle-is-idempotent-and-never-rewrites-allocation',
      checkSettleIsIdempotentAndNeverRewritesAllocation,
    ),
  ]
}
