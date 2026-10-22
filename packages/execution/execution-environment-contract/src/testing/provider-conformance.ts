import assert from 'node:assert/strict'
import {
  acquisitionRef,
  originRef,
  providerFactsSchema,
  managedResourceSchema,
  type EnvironmentProvider,
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
export function environmentProviderConformance(
  options: ProviderConformanceOptions,
): readonly ConformanceCase[] {
  const make = (
    name: string,
    run: (s: ProviderConformanceSubject, input: ProviderAcquireInput) => Promise<void>,
  ): ConformanceCase => ({
    name,
    async run() {
      const s = await options.subject()
      try {
        const input: ProviderAcquireInput = {
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
        await bounded(run(s, input), options.waitMs ?? 1000)
      } finally {
        await s.dispose?.()
      }
    },
  })
  return [
    make('V-EE18.facts-match-declaration', async ({ provider }) => {
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
    }),
    make('V-EE18.refuses-after-retire', async ({ provider }, input) => {
      await provider.retire()
      assert.deepEqual(await provider.acquire(input), {
        kind: 'rejected',
        reason: 'providerUnavailable',
      })
    }),
    make('V-EE18.retire-reports-drained-or-pending', async ({ provider }) => {
      const answer = await provider.retire()
      assert.ok(answer.kind === 'drained' || answer.kind === 'pending')
      if (answer.kind === 'pending')
        for (const r of answer.resources)
          assert.ok(!('issues' in (await managedResourceSchema['~standard'].validate(r))))
    }),
    make('V-EE18.retire-is-retryable', async ({ provider }) => {
      await provider.retire()
      const again = await provider.retire()
      assert.ok(again.kind === 'drained' || again.kind === 'pending')
    }),
    make('V-EE18.retire-waits-for-in-flight', async s => {
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
    }),
    make('V-EE05.receipt-is-provisional', async ({ provider }, input) => {
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
    }),
    make('V-EE20.lease-exposes-only-declared-keys', async ({ provider }, input) => {
      const receipt = await provider.acquire(input)
      assert.equal(receipt.kind, 'acquired')
      if (receipt.kind !== 'acquired') return
      try {
        for (const key of ['files', 'command', 'terminal'] as const)
          if (!provider.facilities.includes(key))
            assert.equal(receipt.lease.facility(key), undefined)
      } finally {
        await receipt.lease.release()
      }
    }),
    make('V-EE13.release-is-retryable', async ({ provider }, input) => {
      const receipt = await provider.acquire(input)
      assert.equal(receipt.kind, 'acquired')
      if (receipt.kind !== 'acquired') return
      for (let n = 0; n < 2; n++) {
        const released = await receipt.lease.release()
        assert.ok(released.kind === 'released' || released.kind === 'pending')
      }
    }),
    make('V-EE22.facts-schema-refusal-has-item-reasons', async ({ provider }) => {
      const result = await providerFactsSchema['~standard'].validate({
        ...(await provider.describe()),
        prerequisites: 'maybe',
      })
      assert.ok(result.issues)
      assert.deepEqual(result.issues[0]?.path, ['prerequisites'])
    }),
  ]
}
