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
import type { PlatformFacts, ProviderFacts } from './environment.ts'
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

/**
 * A calendar date `YYYY-MM-DD` (RFC 3339 full-date) in the host's local time zone. A value of this
 * type comes only from the schema of `execution.host-facts`, which checks that the date exists.
 */
export type HostDate = string & { readonly __hostDate: unique symbol }

/**
 * Host facts: the host's current date when the block producer published the value, and one fact
 * entry per registered provider on this host.
 */
export type ExecutionHostFactsValue = Readonly<{
  date: HostDate
  providers: readonly ProviderFacts[]
}>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'execution.placement': ExecutionPlacementValue
    'execution.host-facts': ExecutionHostFactsValue
  }
}

export const decodeInstance: Decoder<InstanceIdentity> = (value, path) => {
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

const decodePlatform: Decoder<PlatformFacts> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected platform facts')
  const keys = exactKeys(value, path, ['os', 'release'])
  if (!keys.ok) return keys
  const os = decodeString(value['os'], [...path, 'os'])
  if (!os.ok) return os
  const release = decodeString(value['release'], [...path, 'release'])
  if (!release.ok) return release
  return accept(Object.freeze({ os: os.value, release: release.value }))
}

const prerequisiteStates: readonly ProviderFacts['prerequisites'][] = [
  'satisfied',
  'unsatisfied',
  'unknown',
]

const decodePrerequisites: Decoder<ProviderFacts['prerequisites']> = (value, path) => {
  const state = prerequisiteStates.find(candidate => candidate === value)
  return state === undefined
    ? refuse(path, 'expected satisfied, unsatisfied or unknown')
    : accept(state)
}

export const decodeFacts: Decoder<ProviderFacts> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected provider facts')
  const keys = exactKeys(value, path, [
    'provider',
    'generation',
    'version',
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
  const version = decodeString(value['version'], [...path, 'version'])
  if (!version.ok) return version
  const platform = decodePlatform(value['platform'], [...path, 'platform'])
  if (!platform.ok) return platform
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const isolation = decodeArray(decodeIsolationClaim)(value['isolation'], [...path, 'isolation'])
  if (!isolation.ok) return isolation
  const prerequisites = decodePrerequisites(value['prerequisites'], [...path, 'prerequisites'])
  if (!prerequisites.ok) return prerequisites
  return accept(
    Object.freeze({
      provider: provider.value,
      generation: generation.value,
      version: version.value,
      platform: platform.value,
      facilities: facilities.value,
      isolation: isolation.value,
      prerequisites: prerequisites.value,
    }),
  )
}

const fullDate = /^(\d{4})-(\d{2})-(\d{2})$/

// The calendar check: the three numbers name a day that exists, so 2026-02-30 is refused.
function isHostDateText(text: string): text is HostDate {
  const parts = fullDate.exec(text)
  if (parts === null) return false
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  // `setUTCFullYear` takes years below 100 as they are; `Date.UTC` would add 1900.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

const decodeHostDate: Decoder<HostDate> = (value, path) =>
  typeof value === 'string' && isHostDateText(value)
    ? accept(value)
    : refuse(path, 'expected a calendar date YYYY-MM-DD')

const decodeHostFacts: Decoder<ExecutionHostFactsValue> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected host facts')
  const keys = exactKeys(value, path, ['date', 'providers'])
  if (!keys.ok) return keys
  const date = decodeHostDate(value['date'], [...path, 'date'])
  if (!date.ok) return date
  const providers = decodeArray(decodeFacts)(value['providers'], [...path, 'providers'])
  if (!providers.ok) return providers
  return accept(Object.freeze({ date: date.value, providers: providers.value }))
}

const observers: readonly ConsumerClass[] = Object.freeze(['model', 'tool', 'extension'])

/**
 * Current placements of one scope, as a list of original calls. Optional (PC-21): a lawful absence
 * may be absent, but an unavailable, unknown, refused or uninterpretable source is never dropped.
 */
export const executionPlacementBlock: SuppliedBlockDescriptor<
  'execution.placement',
  ExecutionPlacementValue
> = Object.freeze({
  kind: 'supplied',
  key: 'execution.placement',
  schema: standardSchema(decodeArray(decodePlacementEntry)),
  consumers: observers,
  required: false,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'recompute',
})

/**
 * The host's current date, and the name, generation, version, platform (type and release), facility
 * keys, isolation claims and prerequisites of every registered provider.
 */
export const executionHostFactsBlock: SuppliedBlockDescriptor<
  'execution.host-facts',
  ExecutionHostFactsValue
> = Object.freeze({
  kind: 'supplied',
  key: 'execution.host-facts',
  schema: standardSchema(decodeHostFacts),
  consumers: observers,
  required: false,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'recompute',
})
