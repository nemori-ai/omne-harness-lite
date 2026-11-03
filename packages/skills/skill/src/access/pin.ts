// Step 5, `materialOf`: the material to pin, written like a Skill material basis: the basis the caller
// gave, or the adopted material of the reference. Step 7, `pin`: the current snapshot, which
// must carry the digest of that material. A snapshot with another digest means the material
// moved; the caller says what that is for its operation (`adopted-material-changed` when it
// read the adopted material, `basis-unavailable` when it named one).
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  GateFailure,
  PinFailure,
  SkillMaterialBasis,
  SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import type { PackageLocator } from '@omne-harness/skill-contract/provider'
import { sourceFailureTo } from '../mapping.ts'
import type { SkillPorts } from '../ports.ts'
import { checkpoint } from './checkpoint.ts'
import type { Gated } from './gate.ts'

/** The failures of steps 5 and 7: the pin failures of the contract without the gate's. */
export type PinStageFailure = Exclude<PinFailure, GateFailure>
export type Unsupported = Extract<PinStageFailure, { kind: 'unsupported' }>

export const ADOPTED_MATERIAL_CHANGED = Object.freeze({ kind: 'adopted-material-changed' } as const)
export const BASIS_UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' } as const)
const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const UNSUPPORTED = Object.freeze({ kind: 'unsupported', what: 'no-readable-package' } as const)

/** What a moved material is for the operation: the caller gives one of these to `pin`. */
export type MovedFailure = typeof ADOPTED_MATERIAL_CHANGED | typeof BASIS_UNAVAILABLE

/** The failures of step 7 alone: the snapshot mapping and the abort. `basis-unavailable` stays:
 * the snapshot mapping gives it for a missing package when the caller named the material. */
export type SnapshotStageFailure = Exclude<
  PinStageFailure,
  Unsupported | { kind: 'adopted-material-changed' }
>

export type Pinned = Readonly<{
  locator: PackageLocator
  /** The pinned material; its digest is the one the snapshot carries. */
  basis: SkillMaterialBasis
  /** Whether the caller named the material with a basis. */
  byBasis: boolean
  snapshot: SkillPackageSnapshot
}>

/** Step 5: the material to pin. A reference without a digest has no readable package. */
export function materialOf(gated: Gated): Outcome<SkillMaterialBasis, Unsupported> {
  const { ref, basis } = gated
  if (ref.digest === undefined) return fail(UNSUPPORTED)
  if (basis !== undefined) return succeed(basis)
  return succeed({
    capability: ref.capability,
    layer: ref.layer,
    ...(ref.assetVersion === undefined ? {} : { assetVersion: ref.assetVersion }),
    digest: ref.digest,
  })
}

/** Step 7: the current snapshot, which must carry the digest of `material`. */
export async function pin<P, S, F extends MovedFailure>(
  ports: SkillPorts<P, S>,
  gated: Gated,
  material: SkillMaterialBasis,
  moved: F,
  signal?: AbortSignal,
): Promise<Outcome<Pinned, SnapshotStageFailure | F>> {
  const byBasis = gated.basis !== undefined
  const { locator } = gated.ref
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  const taken = await ports.source.snapshot(locator)
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (!('ok' in taken)) return fail(sourceFailureTo('snapshot', taken.failure, byBasis))
  if (taken.ok.digest !== material.digest) return fail(moved)
  return succeed({ locator, basis: material, byBasis, snapshot: taken.ok })
}
