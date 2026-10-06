import type { FinalInputEvidence } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type {
  InputLimitMetric,
  InputLimitRejection,
} from '@omne-harness-lite/model-request-runtime'
import type { TokenMargin } from '@omne-harness-lite/model-request-runtime'
import { object } from './json.ts'
import {
  meterMatches,
  measureFull,
  admissionTokens,
  tokenMarginValid,
  tokenMeasurementValid,
} from './input-meter.ts'
import {
  type InputMeter,
  type FullMeterInput,
  type TokenMeasurement,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'

const metrics = ['maxInputTokens', 'maxRequestBytes', 'maxImageBytes', 'maxImages'] as const
type Metric = (typeof metrics)[number]
type Known = Readonly<{ metric: Metric; actual: JsonNumber; limit: JsonNumber }>
type Estimated = Readonly<{
  metric: 'maxInputTokens'
  estimatedTokens: JsonNumber
  admissionTokens: JsonNumber
  limit: JsonNumber
}>
// Canonical decoding below checks length and padding without a repeated-group
// RegExp stack proportional to the size of a valid inline image.
const encodedImage = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/u

function present(value: JsonValue | undefined, key: string): boolean {
  return object(value) && Object.hasOwn(value, key)
}

/** Checks missing required limit members before any actual-size comparison. */
export function missingInputLimits(
  snapshot: JsonValue | undefined,
): InputLimitRejection | undefined {
  if (!object(snapshot)) return undefined
  const image =
    Array.isArray(snapshot.inputModalities) && snapshot.inputModalities.includes('image')
  const upstream = snapshot.upstreamInputLimits
  const constraints = snapshot.inputConstraints
  const missing: InputLimitMetric[] = []
  if (!Object.hasOwn(snapshot, 'maxInputTokens') || !present(upstream, 'maxInputTokens'))
    missing.push('maxInputTokens')
  if (!present(upstream, 'maxRequestBytes')) missing.push('maxRequestBytes')
  if (image) {
    if (!present(constraints, 'maxImageBytes') || !present(upstream, 'maxImageBytes'))
      missing.push('maxImageBytes')
    if (!present(upstream, 'maxImages')) missing.push('maxImages')
  }
  if (!missing.length) return undefined
  const first = missing[0]
  if (!first) throw new Error('missing metric invariant')
  return {
    rejected: 'invalidInput',
    reason: 'input_limit_missing',
    metrics: [first, ...missing.slice(1)],
  }
}

export function finiteLimits(
  snapshot: ModelProfileSnapshot,
  metric: Metric,
): readonly JsonNumber[] {
  const supply =
    metric === 'maxInputTokens'
      ? snapshot.maxInputTokens
      : metric === 'maxRequestBytes'
        ? snapshot.inputConstraints.maxRequestBytes
        : metric === 'maxImageBytes'
          ? snapshot.inputConstraints.maxImageBytes
          : snapshot.inputConstraints.maxImages
  const upstream = snapshot.upstreamInputLimits[metric]
  return [
    ...(supply === undefined ? [] : [supply]),
    ...(upstream?.status === 'limited' ? [upstream.value] : []),
  ]
}

function compareKnown(
  snapshot: ModelProfileSnapshot,
  metric: Metric,
  actual: JsonNumber,
  exact: boolean,
): { exceeded?: Known; unavailable: boolean } {
  let unavailable = false
  for (const limit of finiteLimits(snapshot, metric)) {
    if (ExactDecimal.from(actual).compare(ExactDecimal.from(limit)) <= 0) continue
    if (exact) return { exceeded: { metric, actual, limit }, unavailable: false }
    unavailable = true
  }
  return { unavailable }
}

function imageMeasurements(body: JsonObject): {
  readonly sizes: readonly number[]
  readonly count: number
  readonly unreadable: boolean
} {
  const sizes: number[] = []
  let count = 0,
    unreadable = false
  if (!Array.isArray(body.messages)) return { sizes, count, unreadable: true }
  for (const message of body.messages) {
    if (!object(message) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!object(part) || part.type !== 'image_url') continue
      count++
      const size = imageBytes(part)
      if (size === undefined) {
        unreadable = true
        continue
      }
      sizes.push(size)
    }
  }
  return { sizes, count, unreadable }
}

/** Final bytes and media are measured from precisely the body sent by http.ts. */
export function checkFinalInput(input: {
  readonly definition: ModelDefinition
  readonly provider: string
  readonly snapshot: ModelProfileSnapshot
  readonly body: JsonObject
  readonly serialized: string
  readonly meter: InputMeter | undefined
  readonly tokenMargin: TokenMargin
  readonly tokenMeasurement: TokenMeasurement
}):
  { readonly ok: FinalInputEvidence } | InputLimitRejection | { readonly rejected: 'unavailable' } {
  const { definition, provider, snapshot, body, serialized, meter, tokenMargin } = input
  if (!tokenMarginValid(tokenMargin)) throw new TypeError('unvalidated token margin')
  if (!meter || !meterMatches(meter, definition, provider)) return { rejected: 'unavailable' }
  const image = imageMeasurements(body)
  const requestBytes = Buffer.byteLength(serialized, 'utf8')
  let token: TokenMeasurement
  try {
    token = input.tokenMeasurement
    if (!tokenMeasurementValid(token))
      return {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      }
  } catch {
    return {
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxInputTokens'],
    }
  }
  const measured = new Map<Metric, { value: JsonNumber; exact: boolean }>([
    ['maxRequestBytes', { value: requestBytes, exact: true }],
    ['maxImages', { value: image.count, exact: true }],
  ])
  if (token.kind !== 'unavailable' && token.kind !== 'estimated')
    measured.set('maxInputTokens', { value: token.tokens, exact: token.kind === 'exact' })
  const unavailable: InputLimitMetric[] = []
  const exactExceeds: Known[] = []
  const estimatedExceeds: Estimated[] = []
  const admitted =
    token.kind === 'estimated' ? admissionTokens(token.tokens, tokenMargin) : undefined
  compareMeasuredLimits()
  compareEstimatedLimits()
  const rejected = limitRejection()
  if (rejected) return rejected
  return {
    ok: Object.freeze({
      meterRevision: meter.algorithmRevision,
      meterEvidence: meter.evidence,
      inputTokens: token,
      tokenMargin: Object.freeze({ ...tokenMargin }),
      ...(admitted === undefined ? {} : { admissionTokens: admitted }),
      requestBytes,
      imageBytes: Object.freeze([...image.sizes]),
      images: image.count,
    }),
  }

  function compareMeasuredLimits(): void {
    if (token.kind === 'unavailable') unavailable.push('maxInputTokens')
    if (image.unreadable) unavailable.push('maxImageBytes')
    for (const metric of metrics) {
      if (metric === 'maxImageBytes') {
        if (image.unreadable) continue
        for (const size of image.sizes) {
          const result = compareKnown(snapshot, metric, size, true)
          if (result.exceeded) exactExceeds.push(result.exceeded)
        }
        continue
      }
      const value = measured.get(metric)
      if (!value) continue
      const result = compareKnown(snapshot, metric, value.value, value.exact)
      if (result.exceeded) exactExceeds.push(result.exceeded)
      if (result.unavailable) unavailable.push(metric)
    }
  }

  function compareEstimatedLimits(): void {
    if (token.kind === 'estimated' && admitted !== undefined) {
      for (const limit of finiteLimits(snapshot, 'maxInputTokens')) {
        if (ExactDecimal.from(admitted).compare(ExactDecimal.from(limit)) > 0)
          estimatedExceeds.push({
            metric: 'maxInputTokens',
            estimatedTokens: token.tokens,
            admissionTokens: admitted,
            limit,
          })
      }
    }
  }

  function limitRejection(): InputLimitRejection | undefined {
    const exactExceed = exactExceeds[0]
    if (exactExceed)
      return {
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'exact',
        ...exactExceed,
      }
    const estimatedExceed = estimatedExceeds[0]
    if (estimatedExceed)
      return {
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
        ...estimatedExceed,
      }
    if (unavailable.length) {
      const first = unavailable[0]
      if (!first) throw new Error('unavailable metric invariant')
      return {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: [first, ...unavailable.slice(1)],
      }
    }
    return undefined
  }
}

/** Public full measurement always calls the supplied fixed meter; no caller passed flag. */
export function measureFinalInput(
  input: Omit<Parameters<typeof checkFinalInput>[0], 'tokenMeasurement'> &
    Pick<FullMeterInput, 'projection' | 'outputHistory' | 'historySpans'>,
): ReturnType<typeof checkFinalInput> {
  if (!input.meter || !meterMatches(input.meter, input.definition, input.provider))
    return { rejected: 'unavailable' }
  let token: TokenMeasurement
  try {
    token = measureFull(input.meter, {
      body: input.body,
      serialized: input.serialized,
      projection: input.projection,
      outputHistory: input.outputHistory,
      historySpans: input.historySpans,
    })
  } catch {
    token = { kind: 'unavailable' }
  }
  return checkFinalInput({ ...input, tokenMeasurement: token })
}

function imageBytes(part: JsonObject): number | undefined {
  const image = part.image_url
  const match = object(image) && typeof image.url === 'string' ? encodedImage.exec(image.url) : null
  const encoded = match?.[1]
  if (!encoded) return undefined
  const decoded = Buffer.from(encoded, 'base64')
  if (!decoded.length || decoded.toString('base64') !== encoded) return undefined
  return decoded.byteLength
}
