import { type JsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'

import type { PlanCalibration, PlanOutputHistoryGroup } from './planning-types.ts'
import type { CountingBasis } from '@omne-harness-lite/model-response'

import type { InputProjection } from './input-projection.ts'

export interface HistorySelectionSpan {
  readonly groupIndex: number
  readonly selectionIndex: number
  readonly start: number
  readonly end: number
}
export interface MeterHistoryInput {
  readonly outputHistory: readonly PlanOutputHistoryGroup[]
  readonly historySpans: readonly HistorySelectionSpan[]
}
export interface FullMeterInput extends MeterHistoryInput {
  readonly body: JsonObject
  readonly serialized: string
  readonly projection: InputProjection
}
/** Only anchor-external final units are exposed to a marginal tokenizer. */
export interface MarginalMeterInput {
  readonly units: readonly JsonValue[]
  readonly envelope: JsonObject
  readonly precedingUnitCount: number
  /** Fixed provider projection: anchor-external fragments and finite terminal framing only. */
  readonly boundary?: JsonObject
}
/**
 * Replay alone receives the original response observation and its current selection.
 * planRequest supplies owned, validated, deeply frozen values. Standalone callers
 * must supply the same relationships; readonly types do not authenticate a source.
 */
export interface ReplayMeterInput extends MarginalMeterInput {
  /** Current actual request basis; never defaulted to the original observation. */
  readonly countingBasis: CountingBasis
  readonly observation: Extract<PlanCalibration, { kind: 'observation' }>
  readonly outputHistory: readonly PlanOutputHistoryGroup[]
  /** Absolute final-projection indices, in the same order as units; never includes P. */
  readonly unitIndices: readonly number[]
  /**
   * Half-open final-projection span of each selected target's message. Several
   * blocks may share one span. Follow actual target order, not selection order,
   * when deciding whether the original output group is selected once in full.
   */
  readonly selectionSpans: readonly {
    readonly selectionIndex: number
    readonly start: number
    readonly end: number
  }[]
}
export interface NewMeterInput extends MarginalMeterInput, MeterHistoryInput {
  readonly unitIndices: readonly number[]
  readonly countingBasis: CountingBasis
}
export type MeterContribution = TokenMeasurement | { readonly kind: 'invalidInput' }

/** A trusted, versioned implementation for one exact model/provider route. */
export interface InputMeter {
  readonly modelId: string
  readonly definitionRevision: string
  readonly implementation: Readonly<{ name: string; revision: string }>
  readonly provider: string
  readonly algorithmRevision: string
  /** Stable source identifier for the route-specific accuracy or upper-bound argument. */
  readonly evidence: string
  /** Includes every input contribution after this provider's final request projection. */
  readonly tokenizerRevision: string
  readonly replayRevision: string
  readonly transformRevision: string
  readonly measureFull: (input: FullMeterInput) => TokenMeasurement
  readonly measureReplay: (input: ReplayMeterInput) => MeterContribution
  readonly measureNew: (input: NewMeterInput) => MeterContribution
}

export type TokenMeasurement =
  | { readonly kind: 'exact' | 'upperBound' | 'estimated'; readonly tokens: JsonNumber }
  | { readonly kind: 'unavailable' }
