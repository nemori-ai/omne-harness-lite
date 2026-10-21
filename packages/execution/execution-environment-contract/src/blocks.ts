import type { ConsumerClass, SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import {
  accept,
  decodeArray,
  decodeBinding,
  decodeContinuity,
  decodeFacilityKey,
  decodeIsolationClaim,
  decodeNumber,
  decodeOrigin,
  decodeString,
  exactKeys,
  isRecord,
  refuse,
  standardSchema,
  type Decoder,
} from './decode.ts'
import type { ProviderFacts } from './environment.ts'
import type { FacilityKey } from './facility.ts'
import type { OriginRef } from './identity.ts'
import type { InstanceIdentity } from './lease.ts'

/** One original call's current placement in a scope. An observation, not control. */
export type ExecutionPlacementEntry = Readonly<{
  origin: OriginRef
  binding: EnvironmentBinding
  instance: InstanceIdentity
  continuity: EnvironmentContinuity
  facilities: readonly FacilityKey[]
  observedAt: number
}>

export type ExecutionPlacementValue = readonly ExecutionPlacementEntry[]

/** One fact entry per registered provider on this host. */
export type ExecutionHostFactsValue = readonly ProviderFacts[]

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'execution.placement': ExecutionPlacementValue
    'execution.host-facts': ExecutionHostFactsValue
  }
}

const decodeInstance: Decoder<InstanceIdentity> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected an instance identity')
  const keys = exactKeys(value, path, ['id', 'generation'])
  if (!keys.ok) return keys
  const id = decodeString(value['id'], [...path, 'id'])
  if (!id.ok) return id
  const generation = decodeString(value['generation'], [...path, 'generation'])
  if (!generation.ok) return generation
  return accept(Object.freeze({ id: id.value, generation: generation.value }))
}

const decodePlacementEntry: Decoder<ExecutionPlacementEntry> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a placement entry')
  const keys = exactKeys(value, path, [
    'origin',
    'binding',
    'instance',
    'continuity',
    'facilities',
    'observedAt',
  ])
  if (!keys.ok) return keys
  const origin = decodeOrigin(value['origin'], [...path, 'origin'])
  if (!origin.ok) return origin
  const binding = decodeBinding(value['binding'], [...path, 'binding'])
  if (!binding.ok) return binding
  const instance = decodeInstance(value['instance'], [...path, 'instance'])
  if (!instance.ok) return instance
  const continuity = decodeContinuity(value['continuity'], [...path, 'continuity'])
  if (!continuity.ok) return continuity
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const observedAt = decodeNumber(value['observedAt'], [...path, 'observedAt'])
  if (!observedAt.ok) return observedAt
  return accept(
    Object.freeze({
      origin: origin.value,
      binding: binding.value,
      instance: instance.value,
      continuity: continuity.value,
      facilities: facilities.value,
      observedAt: observedAt.value,
    }),
  )
}

const decodeFacts: Decoder<ProviderFacts> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected provider facts')
  const keys = exactKeys(value, path, [
    'provider',
    'generation',
    'platform',
    'facilities',
    'isolation',
    'prerequisites',
  ])
  if (!keys.ok) return keys
  const provider = decodeString(value['provider'], [...path, 'provider'])
  if (!provider.ok) return provider
  const generation = decodeString(value['generation'], [...path, 'generation'])
  if (!generation.ok) return generation
  const platform = decodeString(value['platform'], [...path, 'platform'])
  if (!platform.ok) return platform
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const isolation = decodeArray(decodeIsolationClaim)(value['isolation'], [...path, 'isolation'])
  if (!isolation.ok) return isolation
  const prerequisites = value['prerequisites']
  if (prerequisites !== 'satisfied' && prerequisites !== 'unsatisfied')
    return refuse([...path, 'prerequisites'], 'expected satisfied or unsatisfied')
  return accept(
    Object.freeze({
      provider: provider.value,
      generation: generation.value,
      platform: platform.value,
      facilities: facilities.value,
      isolation: isolation.value,
      prerequisites,
    }),
  )
}

const observers: readonly ConsumerClass[] = Object.freeze(['model', 'tool', 'extension'])

/** Current placements of one scope, as a list of original calls. */
export const executionPlacementBlock: SuppliedBlockDescriptor<
  'execution.placement',
  ExecutionPlacementValue
> = Object.freeze({
  kind: 'supplied',
  key: 'execution.placement',
  schema: standardSchema(decodeArray(decodePlacementEntry)),
  consumers: observers,
  required: true,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'recompute',
})

/** Platform, facility keys, isolation claims and prerequisites of every registered provider. */
export const executionHostFactsBlock: SuppliedBlockDescriptor<
  'execution.host-facts',
  ExecutionHostFactsValue
> = Object.freeze({
  kind: 'supplied',
  key: 'execution.host-facts',
  schema: standardSchema(decodeArray(decodeFacts)),
  consumers: observers,
  required: true,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'recompute',
})
