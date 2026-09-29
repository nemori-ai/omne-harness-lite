import {
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type {
  PlanCalibration,
  PlanOutputHistoryGroup,
  TokenMargin,
} from '@omne-harness-lite/model-request-runtime'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { ModelDefinition } from './definitions.ts'
import type { InputProjection } from './projection.ts'
import { meterHistoryValid, meterReplayValid } from './history-projection.ts'

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

export type { TokenMargin } from '@omne-harness-lite/model-request-runtime'
const meterSources = new WeakMap<InputMeter, object>()
export function meterSource(meter: InputMeter): object {
  return meterSources.get(meter) ?? meter
}

export function tokenMarginValid(value: unknown): value is TokenMargin {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return false
  if (!('multiplier' in value) || !isJsonNumber(value.multiplier)) return false
  if (!('reserveTokens' in value) || !isJsonNumber(value.reserveTokens)) return false
  const multiplier = ExactDecimal.from(value.multiplier)
  const reserve = ExactDecimal.from(value.reserveTokens)
  return (
    multiplier.compare(ExactDecimal.from(1)) >= 0 &&
    reserve.isInteger &&
    reserve.compare(ExactDecimal.from(0)) >= 0
  )
}

function coefficientAndExponent(value: JsonNumber): { coefficient: bigint; exponent: bigint } {
  const source = jsonNumberSource(value)
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (!match?.[2]) throw new TypeError('invalid decimal')
  return {
    coefficient: BigInt(`${match[1] ?? ''}${match[2]}${match[3] ?? ''}`),
    exponent: BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length),
  }
}

function integerValue(value: JsonNumber): bigint {
  const parts = coefficientAndExponent(value)
  if (parts.exponent >= 0n) return parts.coefficient * 10n ** parts.exponent
  const divisor = 10n ** -parts.exponent
  if (parts.coefficient % divisor !== 0n) throw new TypeError('integer required')
  return parts.coefficient / divisor
}

/** Exact decimal ceil; binary floating-point never decides a cap boundary. */
export function admissionTokens(estimatedTokens: JsonNumber, margin: TokenMargin): JsonNumber {
  if (!tokenMarginValid(margin)) throw new TypeError('invalid token margin')
  const estimated = ExactDecimal.from(estimatedTokens)
  if (!estimated.isInteger || estimated.compare(ExactDecimal.from(0)) < 0)
    throw new TypeError('nonnegative estimated token count required')
  const count = integerValue(estimatedTokens)
  const { coefficient, exponent } = coefficientAndExponent(margin.multiplier)
  const product = count * coefficient
  const ceiled =
    exponent >= 0n
      ? product * 10n ** exponent
      : (product + 10n ** -exponent - 1n) / 10n ** -exponent
  const admitted = ceiled + integerValue(margin.reserveTokens)
  return admitted <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(admitted)
    : new LosslessNumber(admitted.toString())
}

export function meterMatches(
  meter: InputMeter,
  definition: ModelDefinition,
  provider: string,
): boolean {
  return (
    meter.modelId === definition.modelId &&
    meter.definitionRevision === definition.revision &&
    meter.implementation.name === definition.implementation.name &&
    meter.implementation.revision === definition.implementation.revision &&
    meter.provider === provider
  )
}

/** Validate trusted code at registration; metadata alone never proves its accuracy. */
export function inputMeterValid(value: unknown): value is InputMeter {
  if (!value || typeof value !== 'object') return false
  return (
    'modelId' in value &&
    typeof value.modelId === 'string' &&
    value.modelId.length > 0 &&
    'definitionRevision' in value &&
    typeof value.definitionRevision === 'string' &&
    value.definitionRevision.length > 0 &&
    'implementation' in value &&
    !!value.implementation &&
    typeof value.implementation === 'object' &&
    'name' in value.implementation &&
    typeof value.implementation.name === 'string' &&
    value.implementation.name.length > 0 &&
    'revision' in value.implementation &&
    typeof value.implementation.revision === 'string' &&
    value.implementation.revision.length > 0 &&
    'provider' in value &&
    typeof value.provider === 'string' &&
    value.provider.length > 0 &&
    'algorithmRevision' in value &&
    typeof value.algorithmRevision === 'string' &&
    value.algorithmRevision.length > 0 &&
    'evidence' in value &&
    typeof value.evidence === 'string' &&
    value.evidence.length > 0 &&
    ['tokenizerRevision', 'replayRevision', 'transformRevision'].every(
      key =>
        key in value &&
        typeof (value as Record<string, unknown>)[key] === 'string' &&
        ((value as Record<string, unknown>)[key] as string).length > 0,
    ) &&
    'measureFull' in value &&
    typeof value.measureFull === 'function' &&
    'measureReplay' in value &&
    typeof value.measureReplay === 'function' &&
    'measureNew' in value &&
    typeof value.measureNew === 'function'
  )
}

export function ownInputMeter(value: unknown): InputMeter | undefined {
  if (!inputMeterValid(value)) return undefined
  const owned = Object.freeze({
    modelId: value.modelId,
    definitionRevision: value.definitionRevision,
    implementation: Object.freeze({ ...value.implementation }),
    provider: value.provider,
    algorithmRevision: value.algorithmRevision,
    evidence: value.evidence,
    tokenizerRevision: value.tokenizerRevision,
    replayRevision: value.replayRevision,
    transformRevision: value.transformRevision,
    measureFull: value.measureFull,
    measureReplay: value.measureReplay,
    measureNew: value.measureNew,
  })
  meterSources.set(owned, meterSource(value))
  return owned
}

/** Meter results are code output, not a flag that can authorize sending by itself. */
export function tokenMeasurementValid(value: unknown): value is TokenMeasurement {
  if (!value || typeof value !== 'object') return false
  if ('kind' in value && value.kind === 'unavailable') return Object.keys(value).length === 1
  if (
    !('kind' in value) ||
    (value.kind !== 'exact' && value.kind !== 'upperBound' && value.kind !== 'estimated')
  )
    return false
  if (!('tokens' in value) || !isJsonNumber(value.tokens) || Object.keys(value).length !== 2)
    return false
  const amount = ExactDecimal.from(value.tokens)
  return amount.isInteger && amount.compare(ExactDecimal.from(0)) >= 0
}

/** Family factories explicitly publish unsupported marginal operations until supplied. */
export function defineInputMeter(
  value: Omit<
    InputMeter,
    'tokenizerRevision' | 'replayRevision' | 'transformRevision' | 'measureReplay' | 'measureNew'
  > &
    Partial<
      Pick<
        InputMeter,
        | 'tokenizerRevision'
        | 'replayRevision'
        | 'transformRevision'
        | 'measureReplay'
        | 'measureNew'
      >
    >,
): InputMeter {
  const unavailable = (): MeterContribution => ({ kind: 'unavailable' })
  return Object.freeze({
    ...value,
    tokenizerRevision: value.tokenizerRevision ?? `tokenizer-basis/${value.algorithmRevision}`,
    replayRevision: value.replayRevision ?? 'unsupported-marginal/1',
    transformRevision: value.transformRevision ?? 'openrouter-wire/2',
    measureReplay: value.measureReplay ?? unavailable,
    measureNew: value.measureNew ?? unavailable,
  })
}
export function meterContributionValid(value: unknown): value is MeterContribution {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false
  if (value.kind === 'unavailable' || value.kind === 'invalidInput')
    return Object.keys(value).length === 1
  if (
    !['exact', 'upperBound', 'estimated'].includes(String(value.kind)) ||
    !('tokens' in value) ||
    !isJsonNumber(value.tokens) ||
    Object.keys(value).length !== 2
  )
    return false
  return ExactDecimal.from(value.tokens).isInteger
}
export function measureFull(meter: InputMeter, input: FullMeterInput): TokenMeasurement {
  try {
    if (
      writeJsonLossless(input.body) !== input.serialized ||
      !meterHistoryValid(input.outputHistory, input.historySpans, input.projection.units.length)
    )
      return { kind: 'unavailable' }
    return meter.measureFull(input)
  } catch {
    return { kind: 'unavailable' }
  }
}
export function measureReplay(meter: InputMeter, input: ReplayMeterInput): MeterContribution {
  try {
    return meterReplayValid(input) ? meter.measureReplay(input) : { kind: 'invalidInput' }
  } catch {
    return { kind: 'invalidInput' }
  }
}
export function measureNew(meter: InputMeter, input: NewMeterInput): MeterContribution {
  if (
    !Array.isArray(input.unitIndices) ||
    !Array.isArray(input.units) ||
    input.unitIndices.length !== input.units.length ||
    !Number.isSafeInteger(input.precedingUnitCount) ||
    input.precedingUnitCount < 0
  )
    return { kind: 'invalidInput' }
  const indices = new Set<number>()
  let upper = input.precedingUnitCount
  for (const index of input.unitIndices) {
    if (!Number.isSafeInteger(index) || index < input.precedingUnitCount || indices.has(index))
      return { kind: 'invalidInput' }
    indices.add(index)
    upper = Math.max(upper, index + 1)
  }
  try {
    return meterHistoryValid(input.outputHistory, input.historySpans, upper, indices)
      ? meter.measureNew(input)
      : { kind: 'invalidInput' }
  } catch {
    return { kind: 'invalidInput' }
  }
}
