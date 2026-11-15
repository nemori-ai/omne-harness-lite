import type { CapabilityId, JsonValue } from '@omne-harness/assets'
import type { CompatibilityHint } from './hints.ts'

declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type SkillName = Brand<string, 'SkillName'>
export type PackagePath = Brand<string, 'PackagePath'>
export type EntryDigest = Brand<string, 'EntryDigest'>
export type PackageDigest = Brand<string, 'PackageDigest'>
export type AssetVersion = Brand<string, 'AssetVersion'>
export type SafeReason = Brand<string, 'SafeReason'>
export type MediaType = Brand<string, 'MediaType'>

export type Bytes = Uint8Array

export type SourceLayer = 'official' | 'organization' | 'tenant' | 'workspace'

export type SettingCategory = 'preference' | 'binding' | 'placement-identity' | 'governance'

export type PackageEntry = Readonly<{
  path: PackagePath
  encoding: 'text' | 'binary'
  size: number
  mediaType?: MediaType
  digest: EntryDigest
}>

export type SkillPackageSnapshot = Brand<SnapshotShape, 'SkillPackageSnapshot'>

export type SnapshotShape = Readonly<{
  rootName: string
  entries: readonly PackageEntry[]
  digest: PackageDigest
}>

export type PackageLocator =
  | Readonly<{ kind: 'directory'; root: string }>
  | Readonly<{ kind: 'content-store'; digest: PackageDigest }>

export type ManifestValue =
  | null
  | boolean
  | number
  | string
  | readonly ManifestValue[]
  | Readonly<{ [key: string]: ManifestValue }>

export type SkillManifest = Readonly<{
  name: SkillName
  description: string
  license?: string
  compatibility?: string
  metadata?: Readonly<Record<string, string>>
  allowedTools?: string
  extra: Readonly<Record<string, ManifestValue>>
}>

export type ScriptDeclaration = Readonly<{
  entry: PackagePath
  runKind: string
  facilities: readonly string[]
  parameters?: JsonValue
}>

export type SettingDeclaration = Readonly<{ name: string; category: SettingCategory }>

export type SkillDeclaration = Readonly<{
  dependencies: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
}>

export type SkillDefinition = Readonly<{
  manifest: SkillManifest
  declaration: SkillDeclaration
  snapshot: SkillPackageSnapshot
  compatibilityHints?: readonly CompatibilityHint[]
}>

export type DeclaredProjection = Readonly<{
  name: SkillName
  description?: string
  tools: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
}>

export type ScriptIdentity = Readonly<{ capability: CapabilityId; entry: PackagePath }>

export type SkillMaterialBasis = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  digest: PackageDigest
}>

export type SkillRef = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  locator: PackageLocator
  digest?: PackageDigest
}>

export type StandIn = Readonly<{
  capability: CapabilityId
  name: SkillName
  description?: string
  reason: SafeReason
}>
