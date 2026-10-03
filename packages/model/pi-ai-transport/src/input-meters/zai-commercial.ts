import { defineInputMeter } from '../input-meter.ts'
// Selected OpenRouter route estimates. The public GLM-5.3 template is a
// diagnostic projection, not proof of either hosted model's tokenizer.
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import { ruleAccepts, type ModelDefinition, type ParameterRule } from '../definitions.ts'
import { zaiDefinitions, type ZaiHistoryTreatment } from '../official-models/zai.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { guardInputMeter } from './shared.ts'
import { exactKeys, glm5Tokenizer } from './zai-glm52.ts'
import { renderGlm53Prompt } from './zai-glm53.ts'
import { zaiCurrentRelease, zaiVisibleHistoryEvidence } from './zai-release.ts'

const commercialRoutes = {
  'z-ai/glm-5.3-prime': 'alibaba',
  'z-ai/glm-5.3-flashx': 'z-ai/fp8',
} as const
type CommercialModelId = keyof typeof commercialRoutes

function commercialModelId(value: string): value is CommercialModelId {
  return Object.hasOwn(commercialRoutes, value)
}

export function projectZaiCommercialBody(
  body: JsonObject,
  modelId: CommercialModelId,
): JsonObject | undefined {
  const provider = commercialRoutes[modelId]
  const effortRule = zaiDefinitions.find(value => value.modelId === modelId)?.routes[provider]
    ?.parameters.reasoningEffort
  if (!effortRule) return undefined
  if (
    body.model !== modelId ||
    !commercialFieldsValid(body) ||
    !commercialEffortValid(body, effortRule) ||
    !commercialProviderValid(body, provider) ||
    !hasMessages(body)
  )
    return undefined
  if (!streamOptionsValid(body)) return undefined

  const messages = projectCacheMessages(body, modelId)
  if (!messages) return undefined
  const projection: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(body))
    if (key !== 'stream_options') projection[key] = value
  projection.messages = messages
  return projection
}

function hasMessages(body: JsonObject): body is JsonObject & { messages: JsonValue[] } {
  return Array.isArray(body.messages)
}

function commercialFieldsValid(body: JsonObject): boolean {
  return (
    exactKeys(body, [
      'model',
      'provider',
      'stream',
      'stream_options',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ]) &&
    body.stream === true &&
    !(body.store !== undefined && body.store !== false)
  )
}

function commercialEffortValid(body: JsonObject, effortRule: ParameterRule<JsonValue>): boolean {
  return !(
    body.reasoning !== undefined &&
    (!object(body.reasoning) ||
      !exactKeys(body.reasoning, ['effort']) ||
      typeof body.reasoning.effort !== 'string' ||
      !ruleAccepts(effortRule, body.reasoning.effort))
  )
}

function commercialProviderValid(body: JsonObject, provider: string): boolean {
  return (
    object(body.provider) &&
    exactKeys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) &&
    Array.isArray(body.provider.order) &&
    body.provider.order.length === 1 &&
    body.provider.order[0] === provider &&
    body.provider.allow_fallbacks === false &&
    body.provider.require_parameters === true
  )
}

function streamOptionsValid(body: JsonObject): boolean {
  return !(
    body.stream_options !== undefined &&
    (!object(body.stream_options) ||
      !exactKeys(body.stream_options, ['include_usage']) ||
      body.stream_options.include_usage !== true)
  )
}

function projectCacheMessages(
  body: JsonObject & { messages: JsonValue[] },
  modelId: CommercialModelId,
): JsonValue[] | undefined {
  // The accepted Prime route can mark its final message for explicit cache.
  // The marker is preserved on the sent body; only the local public-template
  // projection removes this transport hint. Every other unknown member fails.
  const finalCacheable = body.messages.findLastIndex(
    item =>
      object(item) && (item.role === 'user' || item.role === 'assistant' || item.role === 'tool'),
  )
  let markerCount = 0
  const messages: JsonValue[] = []
  for (const [index, raw] of body.messages.entries()) {
    if (!object(raw)) return undefined
    if (!Array.isArray(raw.content)) {
      messages.push(raw)
      continue
    }
    const content: JsonValue[] = []
    for (const part of raw.content) {
      const projected = projectPart(part, index)
      if (projected === undefined) return undefined
      content.push(projected)
    }
    messages.push({ ...raw, content })
  }
  return messages

  function projectPart(part: JsonValue, index: number): JsonValue | undefined {
    if (!object(part)) return undefined
    if (!Object.hasOwn(part, 'cache_control')) {
      return part
    }
    const marker = part.cache_control
    if (
      modelId !== 'z-ai/glm-5.3-prime' ||
      index !== finalCacheable ||
      markerCount++ !== 0 ||
      !cacheTextValid(part, marker)
    )
      return undefined
    return { type: 'text', text: part.text }
  }
}

function cacheTextValid(
  part: JsonObject,
  marker: JsonValue | undefined,
): part is JsonObject & { text: string } {
  return (
    exactKeys(part, ['type', 'text', 'cache_control']) &&
    part.type === 'text' &&
    typeof part.text === 'string' &&
    object(marker) &&
    exactKeys(marker, ['type', 'ttl']) &&
    marker.type === 'ephemeral' &&
    marker.ttl === '5m'
  )
}

/**
 * Supported final-wire subset, projected through the pinned public template. The cache-marker
 * projection and the history treatment touch disjoint members, so their order is immaterial.
 */
export function renderZaiCommercialPrompt(
  body: JsonObject,
  history: ZaiHistoryTreatment,
): string | undefined {
  if (typeof body.model !== 'string' || !commercialModelId(body.model)) return undefined
  const projected = projectZaiCommercialBody(body, body.model)
  return projected ? renderGlm53Prompt(projected, false, history) : undefined
}

/**
 * Separate exact bindings at their current exported release; one-token calibration is
 * observed only for text/tools and is applied once, also to history-bearing input. The
 * full/φ/δ methods run the shared source guards.
 */
export function createZaiCommercialInputMeter(definition: ModelDefinition): InputMeter {
  const modelId = definition.modelId
  const unsupported = new TypeError('unsupported ZAI commercial input-meter binding')
  if (!commercialModelId(modelId)) throw unsupported
  const current = zaiCurrentRelease(definition, commercialRoutes[modelId])
  if (!current) throw unsupported
  const { release, history } = current
  const provider = commercialRoutes[modelId]
  const encoder = glm5Tokenizer()
  const evidence =
    'zai-org/GLM-5.3 aca966e4 template + pinned GLM-5 tokenizer 19e77364; ' +
    'selected OpenRouter route fit/independent holdout 2026-09-28 (each observed=public-1); ' +
    'text/tools only, hosted tokenizer and private transform unknown; ' +
    'declared request effort uses the pinned public template mapping without refitting; ' +
    'Prime low/high/max scope extension has no actual effort holdout or error bound'
  const raw = defineInputMeter({
    modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision: release.algorithmRevision,
    ...(release.tokenizerRevision === undefined
      ? {}
      : { tokenizerRevision: release.tokenizerRevision }),
    evidence: history === 'visible' ? `${evidence}; ${zaiVisibleHistoryEvidence}` : evidence,
    measureFull({ body, serialized }): TokenMeasurement {
      if (body.model !== modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderZaiCommercialPrompt(body, history)
      if (prompt === undefined) return { kind: 'unavailable' }
      try {
        const publicTokens = encoder.encode(prompt, { add_special_tokens: false }).ids.length
        return publicTokens > 1
          ? { kind: 'estimated', tokens: publicTokens - 1 }
          : { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return guardInputMeter(raw)
}
