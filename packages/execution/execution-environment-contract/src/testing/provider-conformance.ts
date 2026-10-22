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
    },
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
  ]
}
