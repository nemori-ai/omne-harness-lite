import { expectTypeOf, it } from 'vitest'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import {
  copyInputCalibration,
  type CountingBasis,
  type RequestInputEvidence,
  type ObservationProvenance,
  type ObservedInput,
  type OutputGroupEvidence,
  type InputCalibration,
  type ModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'

declare const response: ModelResponse
declare const basis: CountingBasis
declare const provenance: ObservationProvenance
declare const output: Extract<OutputGroupEvidence, { kind: 'known' }>

it('shares six closed readonly evidence types and requires calibration on both forms', () => {
  expectTypeOf<ModelResponse['inputCalibration']>().toEqualTypeOf<InputCalibration>()
  expectTypeOf<PendingModelResponse['inputCalibration']>().toEqualTypeOf<InputCalibration>()
  expectTypeOf<CountingBasis['binding']>().toEqualTypeOf<ModelAdaptationBinding>()
  expectTypeOf<
    Extract<RequestInputEvidence, { kind: 'known' }>['prefixBoundary']
  >().toEqualTypeOf<JsonNumber>()
  expectTypeOf<
    Extract<ObservedInput, { kind: 'upstream_total' }>['tokens']
  >().toEqualTypeOf<JsonNumber>()
  expectTypeOf(copyInputCalibration(null)).toEqualTypeOf<
    { readonly ok: InputCalibration } | { readonly rejected: 'malformed' }
  >()
  const independent: InputCalibration = {
    requestInput: { kind: 'unavailable', reason: 'not_retained' },
    observedInput: { kind: 'unavailable', reason: 'missing_usage' },
    outputGroup: output,
  }
  expectTypeOf(independent).toEqualTypeOf<InputCalibration>()
  // @ts-expect-error required evidence cannot be removed through an optional field
  const missing: ModelResponse = { ...response, inputCalibration: undefined }
  // @ts-expect-error reason is a closed contract vocabulary
  const reason: ObservedInput = { kind: 'unavailable', reason: 'maybe' }
  // @ts-expect-error known output carries its own projection revision
  const noVersion: OutputGroupEvidence = {
    kind: 'known',
    source: 'none',
    blockDigests: [],
    completeness: 'complete',
    usageRef: 'usage',
  }
  // @ts-expect-error from_usage has no duplicate total
  const double: ObservedInput = { kind: 'from_usage', provenance, tokens: 1 }
  // @ts-expect-error field paths are readonly
  provenance.fieldPaths.push('second')
  // @ts-expect-error nested binding configuration is readonly
  basis.binding.configuration.values.changed = 1
  // @ts-expect-error output digest array is readonly
  output.blockDigests.push('digest')
  expectTypeOf(missing).toExtend<ModelResponse>()
  expectTypeOf(reason).toExtend<ObservedInput>()
  expectTypeOf(noVersion).toExtend<OutputGroupEvidence>()
  expectTypeOf(double).toExtend<ObservedInput>()
})
