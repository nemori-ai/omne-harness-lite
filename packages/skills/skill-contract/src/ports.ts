// The demand ports of Skill. Skill declares them and integrators implement them. Each port has a
// conformance suite in `./testing`; a passing test double does not show that read rights,
// resolution or durability work in a real implementation.
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

/** The only failure is "cannot decide now". A certain "none" is not a failure. */
export type Reply<T> = Promise<Outcome<T, 'unknown'>>

export type SourceFailure =
  /** No package at the locator. */
  | 'package-not-found'
  /** The package has no such entry. */
  | 'entry-not-found'
  /** The bytes do not match the entry digest. */
  | 'bytes-mismatch'
  /** The entry resolves outside the package root. */
  | 'outside-package'
  /** The source cannot be reached now. */
  | 'unavailable'
  /** At `snapshot`: an entry is a device, a pipe, a socket, or a link that cannot be resolved or
   * forms a cycle. */
  | 'entry-unreadable'

/** Gives bytes only. Every implementation passes the same conformance suite. */
export interface SkillPackageSource {
  /** The current snapshot of the package. It must come from `sealSnapshot`. */
  snapshot(locator: PackageLocator): Promise<Outcome<SkillPackageSnapshot, SourceFailure>>
  /** The bytes of one entry. `digest` is the snapshot digest that the caller already compared. */
  open(
    locator: PackageLocator,
    digest: PackageDigest,
    path: PackagePath,
  ): Promise<Outcome<Bytes, SourceFailure>>
}

/**
 * The answer order of `resolve` is fixed: known-unavailable, then adopted or basis-not-lawful,
 * then none, then unknown. For a principal without the right, the answer does not depend on
 * whether the identity exists.
 */
export type Resolution =
  | Readonly<{
      kind: 'known-unavailable'
      capability: CapabilityId
      reason: SafeReason
      /** The last lawful name and description. */
      name: SkillName
      description?: string
    }>
  | Readonly<{ kind: 'adopted'; ref: SkillRef; declared: DeclaredProjection }>
  /** Only when the identity is adopted and the version of the given basis is not lawful. */
  | Readonly<{ kind: 'basis-not-lawful' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unknown' }>

/** The current lawful set holds only these two answers. */
export type CatalogResolution = Extract<Resolution, { kind: 'adopted' | 'known-unavailable' }>

/** `S` is the scope. The caller gives it; Skill passes it on and does not interpret it. */
export interface SkillResolution<P, S> {
  resolve(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis }>,
  ): Promise<Resolution>
  /** Every identity of the current lawful set. An empty set is an empty list, not a failure. */
  adopted(access: Access<P>, scope: S): Reply<readonly CatalogResolution[]>
}

export type ReadVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>

/** Decides by capability identity only. For a principal without the right, the answer does not
 * depend on whether the identity exists. */
export interface SkillReadCheck<P, S> {
  check(access: Access<P>, scope: S, capability: CapabilityId): Promise<ReadVerdict>
}
