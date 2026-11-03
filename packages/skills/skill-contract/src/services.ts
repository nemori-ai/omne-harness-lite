// The three narrow service interfaces of Skill and their result values. This member has the
// interfaces only; the general implementation lives in another member.
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

/** Checks whether a package is a legal Skill package. No body, no access context: bytes only. */
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

/** A search over name and description. */
export type CatalogQuery = Readonly<{ text: string }>

/**
 * Takes only from the current lawful set. Each identity first passes `SkillReadCheck`: a refused
 * identity does not appear; one unknown answer makes the whole operation unknown. No order, no
 * resident filter, no availability judgment.
 */
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

/** Either a pinned readable package, or the plain fact that there is no readable package. */
export type MaterialState =
  | Readonly<{ kind: 'pinned'; basis: SkillMaterialBasis }>
  | Readonly<{ kind: 'no-readable-package' }>

export type SkillDescription = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  material: MaterialState
  dependencies: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  /** Names and categories only, never setting values. */
  settings: readonly SettingDeclaration[]
  /** Resources are addressed by a path relative to the package root. */
  addressing: 'package-relative-path'
}>

/** The body and the resources are read separately. A resource path is checked at the boundary. */
export type ReadTarget = Readonly<{
  capability: CapabilityId
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: string }>
}>

/** A byte range: a start and a length, so the end cannot come before the start. */
export type ByteRange = Readonly<{ start: number; length: number }>

/** Text or bytes. Skill gives no content block: the receiver builds its own representation. */
export type ReadContent =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'bytes'; bytes: Bytes }>

export type ReadResult = Readonly<{
  /** The material that this page was read from. */
  basis: SkillMaterialBasis
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: PackagePath }>
  mediaType?: MediaType
  content: ReadContent
  /** The range that was actually given, in bytes. */
  range: ByteRange
  total: number
  /** A partial result is not a failure. */
  complete: boolean
}>

export type ResourceListing = Readonly<{
  basis: SkillMaterialBasis
  /** Without the control files. */
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
  /** Every entry, the control files included, each checked: never a partial package. */
  entries: readonly ExportedEntry[]
}>

/** Every operation checks on the spot: `SkillReadCheck` first, then `SkillResolution`. */
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
  /** Always with a basis: the caller takes it from `describe` first. */
  export(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis: SkillMaterialBasis,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<Outcome<SkillExport, ExportFailure>>
}
