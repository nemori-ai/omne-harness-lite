import type { StandardTyped } from '@omne-harness/schema-provider'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { BindingKind } from './binding.ts'
import {
  accept,
  decodeArray,
  decodeBindingKind,
  decodeFacilityKey,
  decodeIsolationClaim,
  exactKeys,
  isRecord,
  refuse,
  standardSchema,
  type Decoder,
} from './decode.ts'
import type { FacilityKey } from './facility.ts'
import type { IsolationClaim } from './requirement.ts'

export type EnvironmentNeedDeclaration = Readonly<{
  facilities: readonly FacilityKey[]
  isolation: readonly IsolationClaim[]
  layers: readonly BindingKind[]
}>

const decodeNeed: Decoder<EnvironmentNeedDeclaration> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected an environment need declaration')
  const keys = exactKeys(value, path, ['facilities', 'isolation', 'layers'])
  if (!keys.ok) return keys
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const isolation = decodeArray(decodeIsolationClaim)(value['isolation'], [...path, 'isolation'])
  if (!isolation.ok) return isolation
  const layers = decodeArray(decodeBindingKind)(value['layers'], [...path, 'layers'])
  if (!layers.ok) return layers
  return accept(
    Object.freeze({
      facilities: facilities.value,
      isolation: isolation.value,
      layers: layers.value,
    }),
  )
}

export const environmentNeedSchema: StandardSchemaV1<unknown, EnvironmentNeedDeclaration> &
  StandardTyped<EnvironmentNeedDeclaration> = standardSchema(decodeNeed)

export const environmentNeedAdoption: Readonly<{
  owner: 'execution-environment'
  name: 'environment-need'
  revision: '1'
  digest: `sha256:${string}`
}> = Object.freeze({
  owner: 'execution-environment',
  name: 'environment-need',
  revision: '1',
  digest: 'sha256:0ff805e191b31060011970244f655f718cb25c36d01e9ba049a56380417b0ceb',
})
