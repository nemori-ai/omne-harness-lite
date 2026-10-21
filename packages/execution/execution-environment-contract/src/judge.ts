import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EnvironmentBinding } from './binding.ts'
import {
  accept,
  decodeArray,
  decodeBinding,
  decodeFacilityKey,
  decodeIsolationClaim,
  exactKeys,
  isRecord,
  refuse,
  type Decoder,
  type Issue,
} from './decode.ts'
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
 * Walks `allowedBindings` in order and returns the first provider that declares the layer and covers
 * every facility key and isolation claim. It never picks a layer outside the list. On failure the
 * reason is the closest miss over all layers.
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
      return Object.freeze({ kind: 'matched', provider, binding })
    }
  }
  return Object.freeze({ kind: 'rejected', reason: miss })
}

export type RequirementRefusal = Readonly<{ reason: 'invalidInput'; issues: readonly Issue[] }>

const decodeRequirement: Decoder<EnvironmentRequirement> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected an environment requirement')
  const keys = exactKeys(value, path, ['allowedBindings', 'facilities', 'isolation'])
  if (!keys.ok) return keys
  const allowedBindings = decodeArray(decodeBinding)(value['allowedBindings'], [
    ...path,
    'allowedBindings',
  ])
  if (!allowedBindings.ok) return allowedBindings
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const isolation = decodeArray(decodeIsolationClaim)(value['isolation'], [...path, 'isolation'])
  if (!isolation.ok) return isolation
  return accept(
    Object.freeze({
      allowedBindings: allowedBindings.value,
      facilities: facilities.value,
      isolation: isolation.value,
    }),
  )
}

/** Decodes an external value into an `EnvironmentRequirement` once, at the boundary. */
export function judgeRequirement(
  value: unknown,
): Outcome<EnvironmentRequirement, RequirementRefusal> {
  const decoded = decodeRequirement(value, [])
  return decoded.ok
    ? succeed(decoded.value)
    : fail(Object.freeze({ reason: 'invalidInput', issues: decoded.issues }))
}
