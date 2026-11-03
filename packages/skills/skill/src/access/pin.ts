// Steps 5 and 7: the digest of the pinned material, then the current snapshot, which must carry
// that digest. A snapshot with another digest means the material moved: `basis-unavailable` when
// the caller named it, `adopted-material-changed` when it read the adopted one.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { PackageDigest, PinFailure, SkillPackageSnapshot } from '@omne-harness/skill-contract'
import type { PackageLocator, SourceFailure } from '@omne-harness/skill-contract/provider'
import { sourceFailureTo } from '../mapping.ts'
import type { SkillPorts } from '../ports.ts'
import { checkpoint } from './checkpoint.ts'
import type { Gated, GatedWithBasis } from './gate.ts'

export type Pinned = Readonly<{
  gated: Gated
  /** The digest of the pinned material: the basis digest, or the digest of the reference. */
  digest: PackageDigest
  snapshot: SkillPackageSnapshot
  locator: PackageLocator
}>

export type PinnedWithBasis = Pinned & Readonly<{ gated: GatedWithBasis }>

type SnapshotFailure = Extract<
  PinFailure,
  { kind: 'basis-unavailable' | 'source-unavailable' | 'outside-package' }
>

const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const SOURCE_UNAVAILABLE = Object.freeze({ kind: 'source-unavailable' } as const)

/** A source failure at `snapshot`, mapped. A snapshot that answers about one entry breaks the
 * port contract, so the source is not usable: `source-unavailable`. */
function snapshotFailure(failure: SourceFailure, basis: boolean): SnapshotFailure {
  const mapped = sourceFailureTo('access', failure, basis)
  return mapped.kind === 'resource-missing' || mapped.kind === 'version-changed'
    ? SOURCE_UNAVAILABLE
    : mapped
}

export function pin<P, S>(
  ports: SkillPorts<P, S>,
  gated: GatedWithBasis,
  signal?: AbortSignal,
): Promise<Outcome<PinnedWithBasis, Exclude<PinFailure, { kind: 'adopted-material-changed' }>>>
export function pin<P, S>(
  ports: SkillPorts<P, S>,
  gated: Gated,
  signal?: AbortSignal,
): Promise<Outcome<Pinned, PinFailure>>
export async function pin<P, S>(
  ports: SkillPorts<P, S>,
  gated: Gated,
  signal?: AbortSignal,
): Promise<Outcome<Pinned, PinFailure>> {
  const { ref, basis } = gated
  // Step 5: no digest in the reference means the asset body has no readable package.
  if (ref.digest === undefined) return fail({ kind: 'unsupported', what: 'no-readable-package' })
  const digest = basis?.digest ?? ref.digest
  // Step 7: the current snapshot must carry the pinned digest.
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  const taken = await ports.source.snapshot(ref.locator)
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (!('ok' in taken)) return fail(snapshotFailure(taken.failure, basis !== undefined))
  if (taken.ok.digest !== digest)
    return fail(
      basis === undefined ? { kind: 'adopted-material-changed' } : { kind: 'basis-unavailable' },
    )
  return succeed({ gated, digest, snapshot: taken.ok, locator: ref.locator })
}
