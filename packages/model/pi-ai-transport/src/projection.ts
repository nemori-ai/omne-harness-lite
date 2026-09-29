import { cacheNeutralBody } from './anthropic-cache.ts'
import { createHash } from 'node:crypto'
import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  judgeContentBlock,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { CountingBasis, RequestInputEvidence } from '@omne-harness-lite/model-response'
import type {
  PlanInput,
  OutputProjectionInput,
  OutputProjectionResult,
} from '@omne-harness-lite/model-request-runtime'
import { codePointOrder } from './definitions.ts'
import { object, ownedObject } from './json.ts'
import type { InputMeter } from './input-meter.ts'
import { deepSeekBoundaries } from './input-meters/deepseek-boundary.ts'
import { renderDeepSeekV4Prompt } from './input-meters/deepseek-v4-pro.ts'
import { renderDeepSeekV41Prompt } from './input-meters/deepseek-v41-flash.ts'
import { composeTransformRevision, type ImagePreparationRevision } from './meter-transform.ts'

export const INPUT_PROJECTION_REVISION = 'openrouter-input-projection/3'
const anthropicModels = new Set([
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-fable-5.1',
])
export function stableAnthropicRoute(input: PlanInput): boolean {
  return (
    anthropicModels.has(input.routeName) &&
    input.provider === 'anthropic' &&
    input.snapshot.adaptation.implementation.name === 'pi-ai:anthropic' &&
    input.snapshot.adaptation.implementation.revision === 'mp4-18'
  )
}
function encodeSorted(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(encodeSorted).join(',')}]`
  if (value !== null && typeof value === 'object' && !isJsonNumber(value))
    return `{${Object.keys(value)
      .sort(codePointOrder)
      .map(key => `${writeJsonLossless(key)}:${encodeSorted((value as JsonObject)[key]!)}`)
      .join(',')}}`
  return writeJsonLossless(value)
}
/** Own JSON before accessing members: getters and non-JSON objects cannot enter C. */
export function canonicalProjection(value: unknown): string {
  const owned = copyJsonValue(value)
  if ('failed' in owned) throw new TypeError('non-JSON projection')
  return encodeSorted(owned.ok)
}
export function projectionDigest(
  domain: string,
  value: unknown,
  revision = INPUT_PROJECTION_REVISION,
): string {
  return createHash('sha256')
    .update(canonicalProjection([revision, domain, value]), 'utf8')
    .digest('hex')
}
export function outputBlockDigest(block: unknown, revision = INPUT_PROJECTION_REVISION): string {
  return projectionDigest('output-block', block, revision)
}
export function prefixDigest(units: readonly JsonValue[]): string {
  return projectionDigest('input-prefix', units)
}
export interface InputProjection {
  readonly units: readonly JsonValue[]
  readonly envelope: JsonObject
  readonly requestInput: Extract<RequestInputEvidence, { kind: 'known' }>
}
export function countingBasis(
  input: PlanInput,
  meter: InputMeter,
  preparation?: ImagePreparationRevision,
): CountingBasis {
  return Object.freeze({
    binding: input.snapshot.adaptation,
    model: input.routeName,
    provider: input.provider,
    tokenizerRevision: meter.tokenizerRevision,
    meterRevision: meter.algorithmRevision,
    replayRevision: meter.replayRevision,
    transformRevision: composeTransformRevision(meter.transformRevision, preparation),
    projectionRevision: INPUT_PROJECTION_REVISION,
  })
}
/** Called on the final owned wire. Only this planner's precise 1h cache control is neutral. */
export function projectInput(
  body: JsonObject,
  input: PlanInput,
  meter: InputMeter,
  preparation?: ImagePreparationRevision,
): InputProjection {
  const owned = ownedObject(body)
  if (!owned || !Array.isArray(owned.messages)) throw new TypeError('messages required')
  body = owned
  if (!Array.isArray(body.messages)) throw new TypeError('messages required')
  const basis = countingBasis(input, meter, preparation)
  const neutral = cacheNeutralBody(body, basis)
  const units = neutral.messages
  if (!Array.isArray(units)) throw new TypeError('messages required')
  const { messages: _messages, ...rest } = neutral
  const envelope = ownedObject(rest)
  const ownedUnits = copyJsonValue(units)
  if (!envelope || 'failed' in ownedUnits || !Array.isArray(ownedUnits.ok))
    throw new TypeError('invalid projection')
  return Object.freeze({
    units: ownedUnits.ok,
    envelope,
    requestInput: Object.freeze({
      kind: 'known',
      projectionRevision: INPUT_PROJECTION_REVISION,
      prefixBoundary: units.length,
      prefixDigest: prefixDigest(ownedUnits.ok),
      inputEnvelopeDigest: projectionDigest('input-envelope', envelope),
      countingBasis: basis,
    }),
  })
}
/** Independent pure output encoding; does not require requestInput to be known. */
export function projectOutput(input: OutputProjectionInput): OutputProjectionResult {
  if (
    !input ||
    !Array.isArray(input.blocks) ||
    !['reply', 'delivered', 'none'].includes(input.source) ||
    !['complete', 'partial'].includes(input.completeness) ||
    (input.source === 'none' && input.blocks.length !== 0) ||
    (input.source === 'delivered' && input.blocks.length === 0)
  )
    return { invalidInput: { reason: 'malformed' } }
  const blockDigests: string[] = []
  for (const block of input.blocks) {
    const judged = judgeContentBlock(block)
    if ('rejected' in judged) return { invalidInput: { reason: 'malformed' } }
    blockDigests.push(outputBlockDigest(block))
  }
  return {
    projected: Object.freeze({
      kind: 'known',
      projectionRevision: INPUT_PROJECTION_REVISION,
      source: input.source,
      completeness: input.completeness,
      usageRef: 'usage',
      blockDigests: Object.freeze(blockDigests),
    }),
  }
}

/** Narrow binding owns both the provider alias and the semantic boundary check. */
export function deepSeekBoundaryRoute(input: PlanInput): boolean {
  const binding = input.snapshot.adaptation
  if (input.provider !== 'deepinfra/fp8' || binding.implementation.name !== 'pi-ai:deepseek')
    return false
  return (
    (input.routeName === 'deepseek/deepseek-v4-pro-0813' &&
      binding.definition.revision === '4' &&
      binding.implementation.revision === 'mp4-17') ||
    (input.routeName === 'deepseek/deepseek-v4.1-flash' &&
      binding.definition.revision === '3' &&
      binding.implementation.revision === 'mp4-17')
  )
}
export function prepareDeepSeekBoundaries(
  projection: InputProjection,
  n: number,
  replay: ReadonlySet<number>,
) {
  return deepSeekBoundaries(projection.units, projection.envelope, n, replay, body => {
    const mode = object(body.reasoning) && body.reasoning.effort === 'low' ? 'thinking' : 'chat'
    return projection.requestInput.countingBasis.model === 'deepseek/deepseek-v4-pro-0813'
      ? renderDeepSeekV4Prompt(body, mode)
      : renderDeepSeekV41Prompt(body, mode, 'low')
  })
}
