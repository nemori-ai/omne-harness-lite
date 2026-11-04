// The values of the Skill context. All of them are immutable. Skill has no stateful aggregate:
// holding, selection and adoption belong to other owners.
import type { CapabilityId, JsonValue } from '@omne-harness/assets'
import type { CompatibilityHint } from './hints.ts'

declare const brand: unique symbol

/** A value that only its validating function grants. */
export type Brand<T, B extends string> = T & { readonly [brand]: B }

/** One to 64 of a-z, 0-9 and single inner hyphens. Granted by `isSkillName`. */
export type SkillName = Brand<string, 'SkillName'>
/** A normalized path inside a package. Granted by `isPackagePath`; `toPackagePath` normalizes. */
export type PackagePath = Brand<string, 'PackagePath'>
/** The content digest of the bytes of one entry. Granted by `computeDigest`. */
export type EntryDigest = Brand<string, 'EntryDigest'>
/** The content digest of a package snapshot. Granted by `isPackageDigest`. */
export type PackageDigest = Brand<string, 'PackageDigest'>
/** An asset version reference. The asset side gives it; Skill does not interpret it. Granted by
 * `isAssetVersion`. */
export type AssetVersion = Brand<string, 'AssetVersion'>
/** A reason that Skill can show to the principal. Granted by `isSafeReason`. */
export type SafeReason = Brand<string, 'SafeReason'>
/** A media type. An absent media type does not mean text. Granted by `inferMediaType`. */
export type MediaType = Brand<string, 'MediaType'>

export type Bytes = Uint8Array

/** The four source layers. Skill carries the layer and does not interpret it. */
export type SourceLayer = 'official' | 'organization' | 'tenant' | 'workspace'

/** The four setting categories of the ubiquitous language. */
export type SettingCategory = 'preference' | 'binding' | 'placement-identity' | 'governance'

export type PackageEntry = Readonly<{
  path: PackagePath
  /** `text` when the bytes are strict UTF-8 without a NUL character. */
  encoding: 'text' | 'binary'
  size: number
  mediaType?: MediaType
  digest: EntryDigest
}>

/**
 * A Skill package snapshot. Only `sealSnapshot` makes one: the paths are unique, no file is the
 * ancestor directory of another path, and the digest is computed from the entries. The root name
 * comes from the source and is not part of the digest.
 */
export type SkillPackageSnapshot = Brand<SnapshotShape, 'SkillPackageSnapshot'>

/** The fields of a snapshot without its brand. Only `sealSnapshot` turns them into a snapshot. */
export type SnapshotShape = Readonly<{
  rootName: string
  entries: readonly PackageEntry[]
  digest: PackageDigest
}>

/** Where a package is in one kind of source. Opaque to Skill. */
export type PackageLocator =
  | Readonly<{ kind: 'directory'; root: string }>
  | Readonly<{ kind: 'content-store'; digest: PackageDigest }>

/** A value of a frontmatter field that Skill keeps as it is. */
export type ManifestValue =
  | null
  | boolean
  | number
  | string
  | readonly ManifestValue[]
  | Readonly<{ [key: string]: ManifestValue }>

/** The interpreted SKILL.md frontmatter. Fields that Skill does not know stay in `extra`. */
export type SkillManifest = Readonly<{
  name: SkillName
  description: string
  license?: string
  compatibility?: string
  metadata?: Readonly<Record<string, string>>
  /** The space-separated `allowed-tools` text. Metadata only: it grants nothing. */
  allowedTools?: string
  extra: Readonly<Record<string, ManifestValue>>
}>

export type ScriptDeclaration = Readonly<{
  entry: PackagePath
  /** Matches `^[a-z][a-z0-9-]{0,31}$`. Skill does not interpret it. */
  runKind: string
  /** Facility names, each matching the run kind lexicon. Skill does not check them. */
  facilities: readonly string[]
  /** The parameter shape, kept as it was read. */
  parameters?: JsonValue
}>

export type SettingDeclaration = Readonly<{ name: string; category: SettingCategory }>

/** The declarations of `.omne/skill.json`. Names and shapes only, no setting values. */
export type SkillDeclaration = Readonly<{
  /** Required tools: capability identities of the category `tool`. */
  dependencies: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
}>

/** The result of one inspection. It holds no body: the body is read only through `read`. */
export type SkillDefinition = Readonly<{
  manifest: SkillManifest
  declaration: SkillDeclaration
  snapshot: SkillPackageSnapshot
  /** What the package does beyond the native format and was accepted. Absent when nothing. */
  compatibilityHints?: readonly CompatibilityHint[]
}>

/** The declaration projection of an asset body, as the resolution gives it back. */
export type DeclaredProjection = Readonly<{
  name: SkillName
  description?: string
  /** Capability identities of the category `tool`. */
  tools: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
}>

/** A capability identity plus the entry path of a script. Execution is not decided by Skill. */
export type ScriptIdentity = Readonly<{ capability: CapabilityId; entry: PackagePath }>

/**
 * The Skill material basis given to callers. It holds no package locator, so a caller cannot use
 * it to point at a location. It names material and grants no access. A workspace source has no
 * asset version.
 */
export type SkillMaterialBasis = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  digest: PackageDigest
}>

/**
 * The internal reference to one material. It passes only between Skill and `SkillResolution`.
 * An absent digest means that the asset body has no `package.digest`: there is no readable package.
 */
export type SkillRef = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  locator: PackageLocator
  digest?: PackageDigest
}>

/** A stand-in: an identity that is lawfully known and not available now. */
export type StandIn = Readonly<{
  capability: CapabilityId
  name: SkillName
  description?: string
  reason: SafeReason
}>
