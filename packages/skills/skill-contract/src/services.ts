import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  DescribeFailure,
  ExportFailure,
  InspectFailure,
  ListFailure,
  ReadFailure,
} from './failures.ts'
import type {
  Bytes,
  EntryDigest,
  MediaType,
  PackageDigest,
  PackageEntry,
  PackageLocator,
  PackagePath,
  SafeReason,
  ScriptDeclaration,
  SettingDeclaration,
  SkillDefinition,
  SkillMaterialBasis,
  SkillName,
  SourceLayer,
} from './values.ts'

export interface PackageInspection {
  inspect(
    locator: PackageLocator,
    options?: Readonly<{ expectedName?: SkillName }>,
  ): Promise<Outcome<SkillDefinition, InspectFailure>>
}

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

export type MaterialState =
  | Readonly<{ kind: 'pinned'; basis: SkillMaterialBasis }>
  | Readonly<{ kind: 'no-readable-package' }>

export type SkillDescription = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  material: MaterialState
  dependencies: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
  addressing: 'package-relative-path'
}>

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
}>

export type ResourceListing = Readonly<{
  basis: SkillMaterialBasis
  resources: readonly PackageEntry[]
}>

export type ExportedEntry = Readonly<{
  path: PackagePath
  mediaType?: MediaType
  size: number
  digest: EntryDigest
  bytes: Bytes
}>

export type SkillExport = Readonly<{
  basis: SkillMaterialBasis
  digest: PackageDigest
  entries: readonly ExportedEntry[]
}>

export interface SkillAccess<P, S> {
  describe(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis }>,
  ): Promise<Outcome<SkillDescription, DescribeFailure>>
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
  export(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis: SkillMaterialBasis,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<Outcome<SkillExport, ExportFailure>>
}
