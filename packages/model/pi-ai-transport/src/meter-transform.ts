import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { validate, type CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '@omne-harness-lite/model-request-runtime'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from './projection.ts'
import { object } from './json.ts'

export interface ImagePreparationRevision {
  readonly algorithmRevision: string
  readonly codecRevision: string
  readonly policyDigest: string
}
export type TransformInspection =
  | {
      readonly kind: 'known'
      readonly base: string
      readonly preparation: Readonly<ImagePreparationRevision> | null
    }
  | { readonly kind: 'unknown' | 'invalid' }
export type KnownTransformRevision = Extract<TransformInspection, { kind: 'known' }>
export type OriginalBasisApplies = (
  original: CountingBasis,
  originalBase: KnownTransformRevision,
) => boolean
export type MeterBasisRelation =
  | { readonly kind: 'currentOnly'; readonly current: KnownTransformRevision }
  | {
      readonly kind: 'sameEffective' | 'changedEffective'
      readonly current: KnownTransformRevision
      readonly original: KnownTransformRevision
    }
  | { readonly kind: 'unavailable' | 'invalidInput' }
const prefix = 'image-input/1:'
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

/** D109 v15r4: a canonical descriptor of the fixed preparation implementation. */
export function composeTransformRevision(
  base: string,
  preparation?: ImagePreparationRevision,
): string {
  if (!nonempty(base)) throw new TypeError('base transform revision required')
  if (preparation === undefined) return base
  const copy = copyJsonValue(preparation)
  if ('failed' in copy || !object(copy.ok))
    throw new TypeError('image preparation revision required')
  const value = copy.ok
  if (
    Object.keys(value).length !== 3 ||
    !nonempty(value.algorithmRevision) ||
    !nonempty(value.codecRevision) ||
    !hash(value.policyDigest)
  )
    throw new TypeError('invalid image preparation revision')
  return (
    prefix +
    JSON.stringify([base, value.algorithmRevision, value.codecRevision, value.policyDigest])
  )
}

/** Unknown versions never become plain revisions by stripping their prefix. */
export function inspectTransformRevision(
  revision: unknown,
  expectedBase: string,
): TransformInspection {
  if (!nonempty(revision) || !nonempty(expectedBase)) return { kind: 'invalid' }
  if (!revision.startsWith(prefix))
    return revision === expectedBase
      ? Object.freeze({ kind: 'known', base: expectedBase, preparation: null })
      : { kind: 'unknown' }
  try {
    const value: unknown = JSON.parse(revision.slice(prefix.length))
    if (!preparationDescriptorValid(value, revision)) return { kind: 'invalid' }
    if (value[0] !== expectedBase) return { kind: 'unknown' }
    return Object.freeze({
      kind: 'known',
      base: value[0],
      preparation: Object.freeze({
        algorithmRevision: value[1],
        codecRevision: value[2],
        policyDigest: value[3],
      }),
    })
  } catch {
    return { kind: 'invalid' }
  }
}

function preparationDescriptorValid(
  value: unknown,
  revision: string,
): value is [string, string, string, string] {
  return !(
    !Array.isArray(value) ||
    value.length !== 4 ||
    !nonempty(value[0]) ||
    !nonempty(value[1]) ||
    !nonempty(value[2]) ||
    !hash(value[3]) ||
    prefix + JSON.stringify(value) !== revision
  )
}

/** All current identities stay exact; the compound descriptor only extends the transform. */
export function inspectCurrentMeterBasis(
  basis: CountingBasis,
  meter: InputMeter,
): TransformInspection {
  const owned = ownBasis(basis)
  if (!owned) return { kind: 'invalid' }
  basis = owned
  const transform = inspectTransformRevision(basis.transformRevision, meter.transformRevision)
  if (transform.kind !== 'known') return transform
  return basis.model === meter.modelId &&
    basis.provider === meter.provider &&
    basis.binding.definition.modelId === meter.modelId &&
    basis.binding.definition.revision === meter.definitionRevision &&
    canonicalProjection(basis.binding.implementation) ===
      canonicalProjection(meter.implementation) &&
    basis.tokenizerRevision === meter.tokenizerRevision &&
    basis.meterRevision === meter.algorithmRevision &&
    basis.replayRevision === meter.replayRevision &&
    basis.projectionRevision === INPUT_PROJECTION_REVISION
    ? transform
    : { kind: 'unknown' }
}

function isBasis(value: unknown): value is CountingBasis {
  return validate('CountingBasis', value).valid
}
export function ownBasis(value: unknown): CountingBasis | undefined {
  const copy = copyJsonValue(value)
  return 'ok' in copy && isBasis(copy.ok) ? copy.ok : undefined
}

/** D109 basis applicability r3: applicability never implies prefix-I compatibility. */
export function relateMeterBases(
  current: CountingBasis,
  original: CountingBasis | undefined,
  meter: InputMeter,
  originalApplies?: OriginalBasisApplies,
): MeterBasisRelation {
  const ownedCurrent = ownBasis(current)
  if (!ownedCurrent) return { kind: 'invalidInput' }
  const currentBase = inspectCurrentMeterBasis(ownedCurrent, meter)
  if (currentBase.kind !== 'known')
    return { kind: currentBase.kind === 'invalid' ? 'invalidInput' : 'unavailable' }
  if (original === undefined) return Object.freeze({ kind: 'currentOnly', current: currentBase })
  const ownedOriginal = ownBasis(original)
  if (!ownedOriginal) return { kind: 'invalidInput' }
  const originalBase = inspectTransformRevision(
    ownedOriginal.transformRevision,
    meter.transformRevision,
  )
  if (originalBase.kind !== 'known')
    return { kind: originalBase.kind === 'invalid' ? 'invalidInput' : 'unavailable' }
  if (!originalBasisAccepted(ownedOriginal, originalBase, meter, originalApplies))
    return { kind: 'unavailable' }
  return Object.freeze({
    kind:
      canonicalProjection(ownedCurrent) === canonicalProjection(ownedOriginal)
        ? 'sameEffective'
        : 'changedEffective',
    current: currentBase,
    original: originalBase,
  })
}

function originalBasisAccepted(
  ownedOriginal: CountingBasis,
  originalBase: KnownTransformRevision,
  meter: InputMeter,
  originalApplies: OriginalBasisApplies | undefined,
): boolean {
  try {
    const applicable: unknown =
      originalApplies === undefined
        ? inspectCurrentMeterBasis(ownedOriginal, meter).kind === 'known'
        : originalApplies(ownedOriginal, originalBase)
    if (applicable !== true) {
      if (
        applicable &&
        (typeof applicable === 'object' || typeof applicable === 'function') &&
        'then' in applicable &&
        typeof applicable.then === 'function'
      )
        void Promise.resolve(applicable).then(
          () => {},
          () => {},
        )
      return false
    }
  } catch {
    return false
  }
  return true
}
