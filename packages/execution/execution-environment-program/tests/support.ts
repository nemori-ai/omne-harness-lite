import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type EnvironmentProvider,
  type FacilityRequest,
  type ProgramFacility,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import { createMemoryResourceLedger } from '@omne-harness/execution-environment-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'

function tenantOf(account: string) {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture')
  return parsed.value
}
export const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
export const scope = { ref: 'suite-scope' } as ProviderAcquireInput['scope']
export const origin = originRef('suite-origin')
export const binding: EnvironmentBinding = { kind: 'stateless_sandbox', scope, origin }

let serial = 0
export function acquireInput(provider: EnvironmentProvider): ProviderAcquireInput {
  return {
    acquisition: acquisitionRef(`acquisition-${String(++serial)}`),
    origin,
    scope,
    tenant,
    ledger: createMemoryResourceLedger().ledger,
    placement: {
      kind: 'placement',
      requirement: {
        allowedBindings: [binding],
        facilities: ['program'],
        isolation: ['restricted-js', 'network-none'],
      },
      binding,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: provider.continuity,
      quotaDomain: provider.quotaDomain,
    },
  }
}

export function request(): FacilityRequest<unknown> {
  return {
    requestId: `request-${String(++serial)}`,
    access: { principal: 'someone', tenant },
    origin,
    binding,
  }
}

export async function leased(provider: EnvironmentProvider) {
  const receipt = await provider.acquire(acquireInput(provider))
  if (receipt.kind !== 'acquired') throw new Error(`expected a lease, got ${receipt.kind}`)
  const facility: ProgramFacility<unknown> | undefined = receipt.lease.facility('program')
  if (facility === undefined) throw new Error('expected the program facility')
  return { lease: receipt.lease, facility }
}
