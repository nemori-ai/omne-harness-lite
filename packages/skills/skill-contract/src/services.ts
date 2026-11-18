import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { ListFailure, ReadFailure } from './failures.ts'
import type {
  Bytes,
  MediaType,
  PackageEntry,
  PackagePath,
  SafeReason,
  SkillMaterialBasis,
  SkillName,
} from './values.ts'

export type CatalogEntry =
  | Readonly<{
      kind: 'adopted'
      capability: CapabilityId
      name: SkillName
      description?: string
      dependencies: readonly CapabilityId[]
    }>
  | Readonly<{
      kind: 'stand-in'
      capability: CapabilityId
      name: SkillName
      description?: string
      reason: SafeReason
    }>

export type CatalogQuery = Readonly<{ text: string }>

export interface SkillCatalog<P, S> {
  summaries(
    access: Access<P>,
    scope: S,
    capabilities?: readonly CapabilityId[],
  ): Promise<Outcome<readonly CatalogEntry[], 'unknown'>>
  search(
    access: Access<P>,
    scope: S,
    query: CatalogQuery,
  ): Promise<Outcome<readonly CatalogEntry[], 'unknown'>>
}

export type ReadTarget = Readonly<{
  capability: CapabilityId
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: string }>
}>

export type ByteRange = Readonly<{ start: number; length: number }>

export type ReadContent =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'bytes'; bytes: Bytes }>

export type ReadResult = Readonly<{
  basis: SkillMaterialBasis
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: PackagePath }>
  mediaType?: MediaType
  content: ReadContent
  range: ByteRange
  total: number
  complete: boolean
  directory?: string
}>

export type ResourceListing = Readonly<{
  basis: SkillMaterialBasis
  resources: readonly PackageEntry[]
  directory?: string
}>

export interface SkillAccess<P, S> {
  read(
    access: Access<P>,
    scope: S,
    target: ReadTarget,
    options?: Readonly<{ basis?: SkillMaterialBasis; range?: ByteRange; signal?: AbortSignal }>,
  ): Promise<Outcome<ReadResult, ReadFailure>>
  list(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis; signal?: AbortSignal }>,
  ): Promise<Outcome<ResourceListing, ListFailure>>
}
