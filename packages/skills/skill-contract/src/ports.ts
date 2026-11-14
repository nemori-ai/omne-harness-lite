import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Bytes,
  DeclaredProjection,
  PackageDigest,
  PackageLocator,
  PackagePath,
  SafeReason,
  SkillMaterialBasis,
  SkillName,
  SkillPackageSnapshot,
  SkillRef,
} from './values.ts'

export type Reply<T> = Promise<Outcome<T, 'unknown'>>

export type SourceFailure =
  | 'package-not-found'
  | 'entry-not-found'
  | 'bytes-mismatch'
  | 'outside-package'
  | 'unavailable'
  | 'entry-unreadable'

export interface SkillPackageSource {
  snapshot(locator: PackageLocator): Promise<Outcome<SkillPackageSnapshot, SourceFailure>>
  open(
    locator: PackageLocator,
    digest: PackageDigest,
    path: PackagePath,
  ): Promise<Outcome<Bytes, SourceFailure>>
}

export type Resolution =
  | Readonly<{
      kind: 'known-unavailable'
      capability: CapabilityId
      reason: SafeReason
      name: SkillName
      description?: string
    }>
  | Readonly<{ kind: 'adopted'; ref: SkillRef; declared: DeclaredProjection }>
  | Readonly<{ kind: 'basis-not-lawful' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unknown' }>

export type CatalogResolution = Extract<Resolution, { kind: 'adopted' | 'known-unavailable' }>

export interface SkillResolution<P, S> {
  resolve(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis }>,
  ): Promise<Resolution>
  adopted(access: Access<P>, scope: S): Reply<readonly CatalogResolution[]>
}

export type ReadVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>

export interface SkillReadCheck<P, S> {
  check(access: Access<P>, scope: S, capability: CapabilityId): Promise<ReadVerdict>
}
