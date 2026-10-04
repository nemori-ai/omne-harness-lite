import { defineInputMeter } from '../input-meter.ts'
import {
  isJsonNumber,
  jsonNumberSource,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'

/** Exploratory features over the frozen final OpenRouter projection; not an InputMeter. */
export interface GoogleCandidateFeatures {
  readonly textTokens: number
  readonly messages: number
  readonly tools: number
  readonly objects: number
  readonly arrays: number
}

/**
 * Counts every scalar and field name in messages/tools, including prior turns,
 * reminders, reasoning and full tool schemas. Media requires separate evidence.
 */
export function googleCandidateFeatures(
  body: JsonObject,
  countText: (text: string) => number,
): GoogleCandidateFeatures | undefined {
  if (!Array.isArray(body.messages) || (body.tools !== undefined && !Array.isArray(body.tools)))
    return undefined
  const tools = body.tools ?? []
  let textTokens = 0
  let objects = 0
  let arrays = 0
  const visitText = (value: string): void => {
    const amount = countText(value)
    if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('invalid tokenizer count')
    textTokens += amount
  }
  const visit = (value: JsonValue): boolean => {
    if (value === null) return true
    if (typeof value === 'string') {
      visitText(value)
      return true
    }
    if (typeof value === 'boolean' || isJsonNumber(value))
      return visit(typeof value === 'boolean' ? String(value) : jsonNumberSource(value))
    if (Array.isArray(value)) {
      arrays++
      return value.every(visit)
    }
    if (!object(value)) return false
    objects++
    if (value.type === 'image_url' || 'image_url' in value || 'input_audio' in value) return false
    return Object.entries(value).every(([key, item]) => visit(key) && visit(item))
  }
  if (!visit(body.messages) || !visit(tools)) return undefined
  if (!Number.isSafeInteger(textTokens)) throw new RangeError('token count overflow')
  return {
    textTokens,
    messages: body.messages.length,
    tools: tools.length,
    objects,
    arrays,
  }
}

export interface GoogleFitRow {
  readonly features: GoogleCandidateFeatures
  readonly promptTokens: number
}

export interface GoogleCandidateFit {
  readonly revision: 'google-gemma4-experimental-1'
  readonly modelId: string
  readonly offset: number
  readonly fitCaseIds: readonly string[]
}

/** One measured offset per exact model; structural features remain diagnostics. */
export function fitGoogleCandidate(
  modelId: string,
  fit: Readonly<{ F1: GoogleFitRow; F2: GoogleFitRow }>,
): GoogleCandidateFit {
  const first = fit.F1
  const second = fit.F2
  for (const row of [first, second])
    if (!Number.isSafeInteger(row.promptTokens) || row.promptTokens < 0)
      throw new TypeError('actual prompt tokens required')
  const offset = Math.ceil(
    (first.promptTokens -
      first.features.textTokens +
      second.promptTokens -
      second.features.textTokens) /
      2,
  )
  return {
    revision: 'google-gemma4-experimental-1',
    modelId,
    offset,
    fitCaseIds: ['F1', 'F2'],
  }
}

export function estimateGoogleCandidate(
  fit: GoogleCandidateFit,
  features: GoogleCandidateFeatures,
): number {
  return Math.max(0, features.textTokens + fit.offset)
}

/** Local calibration only: caller supplies a pinned tokenizer and measured fit. */
export function createGoogleCalibrationMeter(
  definition: ModelDefinition,
  fit: GoogleCandidateFit,
  countText: (text: string) => number,
): InputMeter {
  if (definition.modelId !== fit.modelId || !definition.modelId.startsWith('google/gemini-3.'))
    throw new TypeError('fit and exact Google definition differ')
  return defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'google-ai-studio',
    algorithmRevision: fit.revision,
    evidence: 'Experimental Gemma 4 comparator; not calibrated or accepted for production.',
    measureFull({ body }: Readonly<{ body: JsonObject; serialized: string }>): TokenMeasurement {
      if (body.model !== definition.modelId) return { kind: 'unavailable' }
      const features = googleCandidateFeatures(body, countText)
      return features
        ? { kind: 'estimated', tokens: estimateGoogleCandidate(fit, features) }
        : { kind: 'unavailable' }
    },
  })
}
