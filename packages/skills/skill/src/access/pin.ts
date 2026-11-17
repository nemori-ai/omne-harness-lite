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
import { fieldOf } from '../answer-values.ts'
import { answered } from '../port-answer.ts'
import { sourceAnswer } from '../source-answer.ts'
import { checkpoint } from './checkpoint.ts'
import type { Gated } from './gate.ts'

export type PinStageFailure = Exclude<PinFailure, GateFailure>
export type Unsupported = Extract<PinStageFailure, { kind: 'unsupported' }>

export const ADOPTED_MATERIAL_CHANGED = Object.freeze({ kind: 'adopted-material-changed' } as const)
export const BASIS_UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' } as const)
const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const SOURCE_UNAVAILABLE = Object.freeze({ kind: 'source-unavailable' } as const)
const NO_DIRECTORY = Object.freeze({ ok: null })
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
  directory?: string
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
  const { directory } = ports.source
  const told =
    directory === undefined
      ? NO_DIRECTORY
      : await answered(() => directory.call(ports.source, locator, material.digest), directoryOf)
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (told === undefined) return fail(SOURCE_UNAVAILABLE)
  return succeed({
    locator,
    basis: material,
    byBasis,
    snapshot: taken.ok,
    ...(told.ok === null ? {} : { directory: told.ok }),
  })
}

function directoryOf(answer: unknown): Readonly<{ ok: string | null }> | undefined {
  const ok = fieldOf(answer, 'ok')
  return typeof ok === 'string' || ok === null ? { ok } : undefined
}
