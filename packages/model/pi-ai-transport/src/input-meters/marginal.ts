import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  writeJsonLossless,
  LosslessNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { defineInputMeter, tokenMeasurementValid } from '../input-meter.ts'
import { type InputMeter, type FullMeterInput, type MarginalMeterInput, type MeterContribution, type TokenMeasurement } from '@omne-harness-lite/model-request-runtime'

/** A route-specific JSON surrogate: estimate only new units and their framing.
 * No exact BPE boundary claim: the net surrogate and private framing are estimated.
 * Tools/envelope are already in I, so neither is tokenized again here.
 */
export function withEstimatedJsonMarginals(
  meter: InputMeter,
  measureUnits: (input: MarginalMeterInput) => MeterContribution,
): InputMeter {
  return defineInputMeter({
    ...meter,
    algorithmRevision: `${meter.algorithmRevision}/response-calibration-1`,
    replayRevision: 'visible-final-units-json-net-estimated/1',
    measureReplay: measureUnits,
    measureNew: measureUnits,
  })
}
export function fullJsonMarginal(
  countBody: (input: Pick<FullMeterInput, 'body' | 'serialized'>) => TokenMeasurement,
  input: MarginalMeterInput,
): MeterContribution {
  if (!input.units.length) return { kind: 'exact', tokens: 0 }
  const { tools: _tools, ...envelope } = input.envelope
  const body: JsonObject = { ...envelope, messages: input.units }
  const empty: JsonObject = { ...envelope, messages: [] }
  const contribution = countBody({ body, serialized: writeJsonLossless(body) })
  const framing = countBody({ body: empty, serialized: writeJsonLossless(empty) })
  if (
    !tokenMeasurementValid(contribution) ||
    !tokenMeasurementValid(framing) ||
    contribution.kind === 'unavailable' ||
    framing.kind === 'unavailable'
  )
    return { kind: 'unavailable' }
  return {
    kind: 'estimated',
    tokens: ExactDecimal.from(contribution.tokens)
      .add(
        ExactDecimal.from(new LosslessNumber(`-${ExactDecimal.from(framing.tokens).toString()}`)),
      )
      .toJsonNumber(),
  }
}
