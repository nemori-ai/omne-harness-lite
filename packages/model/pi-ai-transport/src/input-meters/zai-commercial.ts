// Selected OpenRouter route estimates. The public GLM-5.3 template is a
// diagnostic projection, not proof of either hosted model's tokenizer.
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { exactKeys, glm5Tokenizer } from './zai-glm52.ts'
import { renderGlm53Prompt } from './zai-glm53.ts'

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
  if (
    body.model !== modelId ||
    !exactKeys(body, [
      'model',
      'provider',
      'stream',
      'stream_options',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ]) ||
    body.stream !== true ||
    (body.store !== undefined && body.store !== false) ||
    body.reasoning !== undefined ||
    !object(body.provider) ||
    !exactKeys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== provider ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    !Array.isArray(body.messages)
  )
    return undefined
  if (
    body.stream_options !== undefined &&
    (!object(body.stream_options) ||
      !exactKeys(body.stream_options, ['include_usage']) ||
      body.stream_options.include_usage !== true)
  )
    return undefined

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
      if (!object(part)) return undefined
      if (!Object.hasOwn(part, 'cache_control')) {
        content.push(part)
        continue
      }
      const marker = part.cache_control
      if (
        modelId !== 'z-ai/glm-5.3-prime' ||
        index !== finalCacheable ||
        markerCount++ !== 0 ||
        !exactKeys(part, ['type', 'text', 'cache_control']) ||
        part.type !== 'text' ||
        typeof part.text !== 'string' ||
        !object(marker) ||
        !exactKeys(marker, ['type', 'ttl']) ||
        marker.type !== 'ephemeral' ||
        marker.ttl !== '5m'
      )
        return undefined
      content.push({ type: 'text', text: part.text })
    }
    messages.push({ ...raw, content })
  }
  const projection: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(body))
    if (key !== 'stream_options') projection[key] = value
  projection.messages = messages
  return projection
}

/** Supported final-wire subset, projected through the pinned public template. */
export function renderZaiCommercialPrompt(body: JsonObject): string | undefined {
  if (typeof body.model !== 'string' || !commercialModelId(body.model)) return undefined
  const projected = projectZaiCommercialBody(body, body.model)
  return projected ? renderGlm53Prompt(projected, false) : undefined
}

/** Separate exact bindings; one-token calibration is observed only for text/tools. */
export function createZaiCommercialInputMeter(definition: ModelDefinition): InputMeter {
  if (
    !commercialModelId(definition.modelId) ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:zai' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, commercialRoutes[definition.modelId])
  )
    throw new TypeError('unsupported ZAI commercial input-meter binding')
  const modelId = definition.modelId
  const provider = commercialRoutes[modelId]
  const encoder = glm5Tokenizer()
  const meter: InputMeter = {
    modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision:
      modelId === 'z-ai/glm-5.3-prime'
        ? 'prime-public-glm53-route-fit-1'
        : 'flashx-public-glm53-route-fit-1',
    evidence:
      'zai-org/GLM-5.3 aca966e4 template + pinned GLM-5 tokenizer 19e77364; ' +
      'selected OpenRouter route fit/independent holdout 2026-09-28 (each observed=public-1); ' +
      'text/tools only, hosted tokenizer and private transform unknown',
    measure({ body, serialized }): TokenMeasurement {
      if (body.model !== modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderZaiCommercialPrompt(body)
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
  }
  return Object.freeze(meter)
}
