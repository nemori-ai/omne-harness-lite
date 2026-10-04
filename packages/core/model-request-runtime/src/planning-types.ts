
import type { ContentBlock, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Usage } from '@omne-harness-lite/call-accounts'


import type { CountingBasis, InputCalibration, Route } from '@omne-harness-lite/model-response'







/** Explicit per-plan estimate policy; never used as upstream usage. */
export interface TokenMargin {
  readonly multiplier: JsonNumber
  readonly reserveTokens: JsonNumber
}
export interface ReplaySelection {
  readonly sourceBlockIndex: number
  readonly messageIndex: number
  readonly blockIndex: number
}
export type PlanCalibration =
  | { readonly kind: 'none'; readonly reason: 'no_observation' | 'source_unavailable' }
  | {
      readonly kind: 'observation'
      readonly inputCalibration: InputCalibration
      readonly usage: Usage
      readonly outputBlocks: readonly ContentBlock[]
      readonly replaySelection: readonly ReplaySelection[]
    }
/** Original response facts for each output group actually selected into this input. */
export type PlanOutputHistoryGroup = Pick<
  Extract<PlanCalibration, { kind: 'observation' }>,
  'inputCalibration' | 'usage' | 'outputBlocks' | 'replaySelection'
> & {
  readonly origin: Pick<
    Route,
    'adaptation' | 'provider' | 'servingProvider' | 'upstreamModel' | 'parameters'
  >
}
export type MeasurementPrecision = 'exact' | 'upperBound' | 'estimated'
export interface MeasurementContribution {
  readonly tokens: JsonNumber
  readonly precision: MeasurementPrecision
}
export interface MeasurementBase {
  readonly precision: MeasurementPrecision
  readonly predictedInput: JsonNumber
  readonly admissionTokens: JsonNumber
  readonly basis: CountingBasis
}
export type InputMeasurement =
  | (MeasurementBase & {
      readonly mode: 'full'
      readonly fallbackReason?:
        'source_unavailable' | 'no_observation' | 'prefix_changed' | 'basis_changed'
      readonly fullContribution: MeasurementContribution
      readonly replayContribution?: never
      readonly newContribution?: never
    })
  | (MeasurementBase & {
      readonly mode: 'marginal'
      readonly fallbackReason?: never
      readonly fullContribution?: never
      readonly replayContribution: MeasurementContribution
      readonly newContribution: MeasurementContribution
    })
