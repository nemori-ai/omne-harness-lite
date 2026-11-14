import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  GateFailure,
  PinFailure,
  SkillMaterialBasis,
  SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import { isSealedSnapshot, type PackageLocator } from '@omne-harness/skill-contract/provider'
import { sourceFailureTo } from '../mapping.ts'
import type { SkillPorts } from '../ports.ts'
import { sourceAnswer } from '../source-answer.ts'
import { checkpoint } from './checkpoint.ts'
import type { Gated } from './gate.ts'

export type PinStageFailure = Exclude<PinFailure, GateFailure>
export type Unsupported = Extract<PinStageFailure, { kind: 'unsupported' }>

export const ADOPTED_MATERIAL_CHANGED = Object.freeze({ kind: 'adopted-material-changed' } as const)
export const BASIS_UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' } as const)
const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const UNSUPPORTED = Object.freeze({ kind: 'unsupported', what: 'no-readable-package' } as const)

export type MovedFailure = typeof ADOPTED_MATERIAL_CHANGED | typeof BASIS_UNAVAILABLE

export type SnapshotStageFailure = Exclude<
  PinStageFailure,
  Unsupported | { kind: 'adopted-material-changed' }
>

export type Pinned = Readonly<{
  locator: PackageLocator
  basis: SkillMaterialBasis
  byBasis: boolean
  snapshot: SkillPackageSnapshot
}>

export function materialOf(gated: Gated): Outcome<SkillMaterialBasis, Unsupported> {
  const { ref, basis } = gated
  if (basis !== undefined) return succeed(basis)
  if (ref.digest === undefined) return fail(UNSUPPORTED)
  return succeed({
    capability: ref.capability,
    layer: ref.layer,
    ...(ref.assetVersion === undefined ? {} : { assetVersion: ref.assetVersion }),
    digest: ref.digest,
  })
}

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
  const taken = await sourceAnswer(() => ports.source.snapshot(locator), isSealedSnapshot)
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (!('ok' in taken)) return fail(sourceFailureTo('snapshot', taken.failure, byBasis))
  if (taken.ok.digest !== material.digest) return fail(moved)
  return succeed({ locator, basis: material, byBasis, snapshot: taken.ok })
}
