import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EnvironmentBinding } from './binding.ts'
import { decodeRequirement, type Issue } from './decode.ts'
import type { EnvironmentProvider } from './environment.ts'
import type { Rejected } from './lease.ts'
import type { EnvironmentRequirement } from './requirement.ts'

export type ProviderCapabilities = Pick<
  EnvironmentProvider,
  'bindingKinds' | 'facilities' | 'isolation'
>

export type ProviderMatch<T extends ProviderCapabilities> = Readonly<{
  kind: 'matched'
  provider: T
  binding: EnvironmentBinding
}>

type MatchFailure = 'noMatchingEnvironment' | 'missingFacility' | 'isolationUnconfirmed'

const closeness: Readonly<Record<MatchFailure, number>> = {
  noMatchingEnvironment: 0,
  missingFacility: 1,
  isolationUnconfirmed: 2,
}

/**
 * Walks `allowedBindings` in order and returns the one provider of the first layer that declares
 * the layer and covers every facility key and isolation claim. It never picks a layer outside the
 * list. Two or more qualifying providers in the same layer are an ambiguity, refused rather than
 * resolved by registration order. On failure the reason is the closest miss over all layers.
 */
export function matchProviders<T extends ProviderCapabilities>(
  providers: readonly T[],
  requirement: EnvironmentRequirement,
): ProviderMatch<T> | Rejected {
  let miss: MatchFailure = 'noMatchingEnvironment'
  const record = (reason: MatchFailure) => {
    if (closeness[reason] > closeness[miss]) miss = reason
  }
  for (const binding of requirement.allowedBindings) {
    const qualifying: T[] = []
    for (const provider of providers) {
      if (!provider.bindingKinds.includes(binding.kind)) continue
      if (!requirement.facilities.every(key => provider.facilities.includes(key))) {
        record('missingFacility')
        continue
      }
      if (!requirement.isolation.every(claim => provider.isolation.includes(claim))) {
        record('isolationUnconfirmed')
        continue
      }
      qualifying.push(provider)
    }
    if (qualifying.length > 1)
      return Object.freeze({ kind: 'rejected', reason: 'ambiguousEnvironment' })
    const [provider] = qualifying
    if (provider !== undefined) return Object.freeze({ kind: 'matched', provider, binding })
  }
  return Object.freeze({ kind: 'rejected', reason: miss })
}

export type RequirementRefusal = Readonly<{ reason: 'invalidInput'; issues: readonly Issue[] }>

/** Decodes an external value into an `EnvironmentRequirement` once, at the boundary. */
export function judgeRequirement(
  value: unknown,
): Outcome<EnvironmentRequirement, RequirementRefusal> {
  const decoded = decodeRequirement(value, [])
  return decoded.ok
    ? succeed(decoded.value)
    : fail(Object.freeze({ reason: 'invalidInput', issues: decoded.issues }))
}
