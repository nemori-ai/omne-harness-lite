import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type ProviderAcquireInput,
  type CommandFacility,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import {
  createScriptedEnvironmentProvider,
  createMemoryResourceLedger,
  environmentProviderConformance,
  runConformanceCase,
  type ProviderConformanceSubject,
} from '@omne-harness/execution-environment-contract/testing'

const obligations = [
  'V-EE18.facts-match-declaration',
  'V-EE18.refuses-after-retire',
  'V-EE18.held-facility-refuses-new-operations-after-retire',
  'V-EE18.retire-reports-drained-or-pending',
  'V-EE18.retire-is-retryable',
  'V-EE18.retire-waits-for-in-flight',
  'V-EE05.receipt-is-provisional',
  'V-EE20.lease-exposes-only-declared-keys',
  'V-EE13.release-is-retryable',
  'V-EE22.facts-schema-refusal-has-item-reasons',
  'V-EE25.quota-declaration-has-bounds',
  'V-EE23.inspect-finds-held-acquisition',
  'V-EE23.inspect-never-invents-allocation',
  'V-EE23.different-description-is-conflict',
  'V-EE26.list-includes-open-acquisition',
  'V-EE25.settle-is-idempotent-and-never-rewrites-allocation',
] as const

function subject(fault?: (typeof obligations)[number]): ProviderConformanceSubject {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('invalid tenant fixture')
  const tenant = parsed.value
  let operation: Promise<void> = Promise.resolve()
  let release: () => void = () => {}
  let entered: () => void = () => {}
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  let retiring = false
  let hold = false
  let effects = 0
  const command: CommandFacility<unknown> = {
    async start(request) {
      if (retiring) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
      effects++
      if (hold) {
        operation = new Promise<void>(resolve => {
          release = resolve
        })
        entered()
        await operation
      }
      return { kind: 'unknown', requestId: request.requestId }
    },
  }
  const provider = createScriptedEnvironmentProvider({
    facilities: ['command'],
    lease: { command },
    extraReceiptFields: fault === 'V-EE05.receipt-is-provisional' ? { adoption: {} } : {},
    async retire() {
      retiring = true
      await operation
      return { kind: 'drained' }
    },
  })
  if (fault === 'V-EE18.facts-match-declaration') {
    const describe = provider.describe.bind(provider)
    provider.describe = async () => ({ ...(await describe()), facilities: [] })
  }
  if (
    fault === 'V-EE18.refuses-after-retire' ||
    fault === 'V-EE18.held-facility-refuses-new-operations-after-retire' ||
    fault === 'V-EE18.retire-waits-for-in-flight'
  )
    provider.retire = async () => ({ kind: 'drained' })
  if (fault === 'V-EE18.retire-reports-drained-or-pending')
    Reflect.set(provider, 'retire', async () => ({ kind: 'invented' }))
  if (fault === 'V-EE18.retire-is-retryable') {
    let calls = 0
    Reflect.set(provider, 'retire', async () => ({ kind: ++calls === 1 ? 'drained' : 'invented' }))
  }
  if (fault === 'V-EE20.lease-exposes-only-declared-keys') {
    const acquire = provider.acquire.bind(provider)
    provider.acquire = async input => {
      const answer = await acquire(input)
      if (answer.kind === 'acquired') {
        const facility = answer.lease.facility.bind(answer.lease)
        Reflect.set(answer.lease, 'facility', (key: FacilityKey) =>
          key === 'terminal' ? {} : facility(key),
        )
      }
      return answer
    }
  }
  if (fault === 'V-EE13.release-is-retryable') {
    const acquire = provider.acquire.bind(provider)
    provider.acquire = async input => {
      const answer = await acquire(input)
      if (answer.kind === 'acquired') {
        let calls = 0
        Reflect.set(answer.lease, 'release', async () => ({
          kind: ++calls === 1 ? 'released' : 'invented',
        }))
      }
      return answer
    }
  }
  if (fault === 'V-EE22.facts-schema-refusal-has-item-reasons') {
    const describe = provider.describe.bind(provider)
    Reflect.set(provider, 'describe', async () => {
      const { provider: _provider, ...facts } = await describe()
      return facts
    })
  }
  if (fault === 'V-EE25.quota-declaration-has-bounds')
    provider.quota = async () => ({
      kind: 'declared',
      quota: { unit: 'unsettled-acquisition', perTenant: -1, global: null },
    })
  if (fault === 'V-EE23.inspect-finds-held-acquisition')
    provider.inspectAcquisition = async () => ({ kind: 'notAllocated' })
  if (
    fault === 'V-EE23.inspect-never-invents-allocation' ||
    fault === 'V-EE23.different-description-is-conflict'
  )
    provider.inspectAcquisition = async () => ({ kind: 'settled' })
  if (fault === 'V-EE26.list-includes-open-acquisition')
    provider.listAcquisitions = async () => ({ kind: 'listed', acquisitions: [] })
  if (fault === 'V-EE25.settle-is-idempotent-and-never-rewrites-allocation') {
    const settle = provider.settleAcquisition.bind(provider)
    let calls = 0
    provider.settleAcquisition = async original =>
      ++calls === 1 ? settle(original) : { kind: 'notAllocated' }
  }
  const ref = 'provider-suite'
  function isScope(value: string): value is ProviderAcquireInput['scope']['ref'] {
    return value.length > 0
  }
  if (!isScope(ref)) throw new Error('invalid scope fixture')
  return {
    provider,
    binding: { kind: 'host_machine' },
    scope: { ref },
    tenant,
    facility: 'command',
    hooks: {
      async prepareHeldOperation({ lease, input }) {
        const command = lease.facility('command')
        if (!command) throw new Error('missing command')
        return {
          run: () =>
            command.start({
              requestId: 'late',
              origin: input.origin,
              access: { principal: 'suite', tenant },
              binding: input.placement.binding,
              executable: 'true',
              args: [],
              cwd: '.',
              env: {},
              outputMode: 'separate',
            }),
          async effectSnapshot() {
            return effects
          },
        }
      },
      async holdNextOperation() {
        const origin = originRef('held-operation')
        const binding = { kind: 'host_machine' } as const
        const input: ProviderAcquireInput = {
          acquisition: acquisitionRef('held-operation'),
          origin,
          tenant,
          scope: { ref },
          ledger: createMemoryResourceLedger().ledger,
          placement: {
            kind: 'placement',
            binding,
            requirement: { allowedBindings: [binding], facilities: ['command'], isolation: [] },
            provider: {
              name: provider.name,
              generation: provider.generation,
              version: provider.version,
            },
            continuity: provider.continuity,
            quotaDomain: provider.quotaDomain,
          },
        }
        const answer = await provider.acquire(input)
        if (answer.kind !== 'acquired') throw new Error('held acquisition refused')
        const command = answer.lease.facility('command')
        if (!command) throw new Error('missing held command')
        hold = true
        return {
          entered: ready,
          operation() {
            return command.start({
              requestId: 'held',
              origin,
              access: { principal: 'suite', tenant },
              binding,
              executable: 'true',
              args: [],
              cwd: '.',
              env: {},
              outputMode: 'separate',
            })
          },
          release() {
            release()
          },
        }
      },
    },
    async dispose() {
      release()
      await provider.retire()
    },
  }
}

for (const name of obligations) {
  it(name + ' accepts a controlled non-durable provider', async () => {
    const test = environmentProviderConformance({ subject: () => subject() }).find(
      test => test.name === name,
    )
    if (!test) throw new Error('missing public case')
    expect(await runConformanceCase(test)).toEqual({ name, status: 'pass' })
  })
  it(name + ' denies a provider that violates this obligation', async () => {
    const test = environmentProviderConformance({ subject: () => subject(name) }).find(
      test => test.name === name,
    )
    if (!test) throw new Error('missing public case')
    await expect(runConformanceCase(test)).rejects.toMatchObject({ name: 'AssertionError' })
  })
}

it('assembles both public case lists without allocating a subject or invoking its effects', async () => {
  const { executionEnvironmentConformance } =
    await import('@omne-harness/execution-environment-contract/testing')
  const subject = () => {
    throw new Error('subject must be lazy')
  }
  const providers = environmentProviderConformance({ subject })
  const environments = executionEnvironmentConformance({ subject })
  expect(providers.map(test => test.name)).toEqual(obligations)
  expect(environments).toHaveLength(35)
  expect(new Set(environments.map(test => test.name)).size).toBe(35)
  for (const test of [...providers, ...environments]) expect(test.run).toBeTypeOf('function')
})
