import {
  estimateOpenAi56Replay,
  openAi56ReplayModels,
  OPENAI_56_REPLAY_REVISION,
} from './openai-replay.ts'
import { openaiFinalVisibleBindings } from '../official-models/openai.ts'
import {
  openAiProBindings,
  PRO_IMPLEMENTATION_REVISION,
  PRO_TRANSFORM_REVISION,
} from '../usage-scope.ts'
import { withEstimatedJsonMarginals, fullJsonMarginal } from './marginal.ts'
import { defineInputMeter } from '../input-meter.ts'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { getEncoding } from 'js-tiktoken'
import { imageTokens, type ImageRule } from './openai-images.ts'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { FullMeterInput, InputMeter, TokenMeasurement } from '../input-meter.ts'

// The OpenAI tiktoken source maps gpt-5* to o200k_base. This exact allowlist
// does not establish a GPT-6 mapping. The separately calibrated GPT-6 path below
// uses this encoding only as a surrogate and never claims tokenizer identity.
// Source: openai/tiktoken 4e71bbe0c078468e00fefbf94b39849389f346e5/model.py.
function sanitizedBody(
  body: JsonObject,
  rule: ImageRule,
):
  | {
      readonly body: JsonObject
      readonly imageTokens: number
    }
  | undefined {
  if (!Array.isArray(body.messages)) return undefined
  let total = 0
  const messages: JsonValue[] = []
  for (const message of body.messages) {
    if (!object(message)) return undefined
    // The tokenizer basis covers visible reasoning text/summary and their
    // protocol metadata, not the context represented by encrypted payloads.
    // Keep the final wire intact: an unsupported detail makes the whole input
    // unavailable rather than dropping it or counting its ciphertext bytes.
    if (Object.hasOwn(message, 'reasoning_details')) {
      if (!Array.isArray(message.reasoning_details)) return undefined
      for (const detail of message.reasoning_details) {
        if (!object(detail)) return undefined
        const textKey =
          detail.type === 'reasoning.text'
            ? 'text'
            : detail.type === 'reasoning.summary'
              ? 'summary'
              : undefined
        if (
          textKey === undefined ||
          typeof detail[textKey] !== 'string' ||
          (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
          (detail.format !== undefined && typeof detail.format !== 'string') ||
          (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index)) ||
          Object.keys(detail).some(key => !['type', textKey, 'id', 'index', 'format'].includes(key))
        )
          return undefined
      }
    }
    if (!Array.isArray(message.content)) {
      messages.push(message)
      continue
    }
    const parts: JsonValue[] = []
    for (const part of message.content) {
      if (!object(part)) return undefined
      if (part.type !== 'image_url') {
        parts.push(part)
        continue
      }
      if (message.role !== 'user') return undefined
      const tokens = imageTokens(part, rule)
      if (tokens === undefined) return undefined
      total += tokens
      const image = part.image_url
      if (!object(image)) return undefined
      parts.push({ ...part, image_url: { ...image, url: '[image]' } })
    }
    messages.push({ ...message, content: parts })
  }
  return { body: { ...body, messages }, imageTokens: total }
}

let sharedEncoder: ReturnType<typeof getEncoding> | undefined
function encoder(): ReturnType<typeof getEncoding> {
  sharedEncoder ??= getEncoding('o200k_base')
  return sharedEncoder
}

function imageRuleFor(modelId: string): ImageRule | undefined {
  switch (modelId) {
    case 'openai/gpt-6-astra':
      return 'astra-patch'
    case 'openai/gpt-5.6-sol':
    case 'openai/gpt-5.6-terra':
    case 'openai/gpt-5.6-luna':
      return 'gpt56-patch'
    case 'openai/gpt-5.6-sol-pro':
    case 'openai/gpt-5.6-terra-pro':
    case 'openai/gpt-5.6-luna-pro':
      // OpenRouter identifies these exact Pro leaves as the same base model
      // in pro reasoning mode. Reuse the published base image rule only as an
      // estimated proxy; actual Pro preprocessing and input scope are unverified.
      return 'gpt56-patch'
    default:
      return undefined
  }
}

function onlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function visibleTextParts(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      part =>
        object(part) &&
        onlyKeys(part, ['type', 'text']) &&
        part.type === 'text' &&
        typeof part.text === 'string',
    )
  )
}

/** Shared visible-history estimator; adoption remains scoped to each model binding. */
function visibleHistoryTokens(
  body: JsonObject,
  modelId: string,
  tokenizer: ReturnType<typeof encoder>,
): number | undefined {
  // Final-JSON adoption is explicit per binding. Count actual controls without
  // inferring an upstream effort default or a GPT-6 tokenizer identity.
  const finalEfforts =
    modelId === 'openai/gpt-6-sol'
      ? ['none', 'low', 'medium', 'high', 'max']
      : Object.hasOwn(openaiFinalVisibleBindings, modelId)
        ? openaiFinalVisibleBindings[modelId]?.efforts
        : undefined
  if (!finalEfforts) return undefined
  const reasoningValid =
    body.reasoning === undefined ||
    (object(body.reasoning) &&
      onlyKeys(body.reasoning, ['effort']) &&
      finalEfforts.includes(String(body.reasoning.effort)))
  if (
    body.model !== modelId ||
    !onlyKeys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'reasoning',
      'max_tokens',
    ]) ||
    !object(body.provider) ||
    !onlyKeys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'openai' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    body.stream !== true ||
    body.store !== false ||
    !reasoningValid ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    (body.tools !== undefined && (!Array.isArray(body.tools) || !body.tools.length))
  )
    return undefined

  const rule = imageRuleFor(modelId) ?? 'unknown'
  const projected = sanitizedBody(body, rule)
  if (!projected || !Array.isArray(projected.body.messages)) return undefined
  for (const message of projected.body.messages) {
    if (!object(message) || typeof message.role !== 'string') return undefined
    switch (message.role) {
      case 'system':
      case 'developer':
        if (!onlyKeys(message, ['role', 'content']) || !visibleTextParts(message.content))
          return undefined
        break
      case 'user':
        if (
          !onlyKeys(message, ['role', 'content']) ||
          !Array.isArray(message.content) ||
          !message.content.every(
            part =>
              visibleTextParts([part]) ||
              (rule === 'astra-patch' && object(part) && part.type === 'image_url'),
          )
        )
          return undefined
        break
      case 'assistant':
        if (
          !onlyKeys(message, ['role', 'content', 'tool_calls', 'reasoning']) ||
          typeof message.content !== 'string' ||
          (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
          (message.tool_calls !== undefined &&
            (!Array.isArray(message.tool_calls) ||
              !message.tool_calls.length ||
              !message.tool_calls.every(
                call =>
                  object(call) &&
                  onlyKeys(call, ['id', 'type', 'function']) &&
                  typeof call.id === 'string' &&
                  call.type === 'function' &&
                  object(call.function) &&
                  onlyKeys(call.function, ['name', 'arguments']) &&
                  typeof call.function.name === 'string' &&
                  typeof call.function.arguments === 'string',
              )))
        )
          return undefined
        break
      case 'tool':
        if (
          !onlyKeys(message, ['role', 'tool_call_id', 'content']) ||
          typeof message.tool_call_id !== 'string' ||
          typeof message.content !== 'string'
        )
          return undefined
        break
      default:
        return undefined
    }
  }

  if (Array.isArray(body.tools))
    for (const tool of body.tools) {
      if (
        !object(tool) ||
        !onlyKeys(tool, ['type', 'function']) ||
        tool.type !== 'function' ||
        !object(tool.function) ||
        !onlyKeys(tool.function, ['name', 'description', 'parameters']) ||
        typeof tool.function.name !== 'string' ||
        typeof tool.function.description !== 'string' ||
        !object(tool.function.parameters)
      )
        return undefined
    }

  return tokenizer.encode(writeJsonLossless(projected.body)).length + projected.imageTokens
}

/** Model-specific estimates; private OpenRouter/OpenAI formatting remains uncertain. */
export function createOpenAiInputMeter(definition: ModelDefinition): InputMeter {
  const encryptedReplay = openAi56ReplayModels.has(definition.modelId)
  const gpt6SolVisibleHistory = definition.modelId === 'openai/gpt-6-sol'
  const finalBinding = Object.hasOwn(openaiFinalVisibleBindings, definition.modelId)
    ? openaiFinalVisibleBindings[definition.modelId]
    : undefined
  const gpt6VisibleHistory = gpt6SolVisibleHistory || finalBinding !== undefined
  const imageRule = imageRuleFor(definition.modelId)
  const pro = Object.hasOwn(openAiProBindings, definition.modelId)
    ? openAiProBindings[definition.modelId]
    : undefined
  const revision =
    finalBinding?.revision ??
    pro?.revision ??
    (gpt6SolVisibleHistory ? '3' : encryptedReplay ? '6' : '4')
  const implementationRevision =
    finalBinding?.implementationRevision ??
    (pro
      ? PRO_IMPLEMENTATION_REVISION
      : gpt6SolVisibleHistory
        ? 'mp4-6'
        : encryptedReplay
          ? 'mp4-12'
          : 'mp4-5')
  if (
    (!gpt6VisibleHistory && !imageRule) ||
    definition.revision !== revision ||
    definition.implementation.name !== 'pi-ai:openai' ||
    definition.implementation.revision !== implementationRevision ||
    !Object.hasOwn(definition.routes, 'openai')
  )
    throw new TypeError('unsupported OpenAI input-meter binding')
  const tokenizer = encoder()
  const countBody = ({
    body,
    serialized,
  }: Pick<FullMeterInput, 'body' | 'serialized'>): TokenMeasurement => {
    if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
    if (gpt6VisibleHistory) {
      try {
        const tokens = visibleHistoryTokens(body, definition.modelId, tokenizer)
        return tokens === undefined ? { kind: 'unavailable' } : { kind: 'estimated', tokens }
      } catch {
        return { kind: 'unavailable' }
      }
    }
    if (!imageRule) return { kind: 'unavailable' }
    const projected = sanitizedBody(body, imageRule)
    if (!projected) return { kind: 'unavailable' }
    try {
      const textTokens = tokenizer.encode(writeJsonLossless(projected.body)).length
      return { kind: 'estimated', tokens: textTokens + projected.imageTokens }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    ...(pro ? { transformRevision: PRO_TRANSFORM_REVISION } : {}),
    algorithmRevision:
      finalBinding?.algorithmRevision ??
      (gpt6SolVisibleHistory
        ? 'openai-gpt-6-sol-final-visible-json-o200k-1'
        : encryptedReplay
          ? 'openai-gpt-5.6-o200k-base-complete-output-6'
          : 'openai-gpt-5.6-pro-base-image-proxy-1'),
    evidence:
      finalBinding?.evidence ??
      (gpt6SolVisibleHistory
        ? 'OpenRouter OpenAI GPT-6 Sol low-effort o200k text surrogate baseline/length/CJK-code holdout (2026-09-28); complete visible final-request JSON includes controls and extends the surrogate to protocol framing as an estimate; OpenAI reasoning guide separates mode/effort (2026-09-29), declared Sol efforts and absent effort counted as sent; live multi-turn/effort errors and private framing remain unverified'
        : pro
          ? 'OpenAI reasoning guide mode and OpenRouter exact GPT-5.6 Sol/Terra/Luna Pro model pages identify Pro as the same base model in pro mode (2026-09-29); published GPT-5.6 base vision patches reused as an estimated proxy, not verified Pro preprocessing; o200k_base surrogate and private framing remain estimated, input usage scope remains unknown, opaque reasoning unavailable'
          : 'openai/tiktoken 4e71bbe0 model.py gpt-5 -> o200k_base; developers.openai.com/api/docs/guides/images-vision GPT-5.6 base detail/patch rules (2026-09-28); OpenRouter/OpenAI private chat formatting estimated; reasoning replay limited to visible text/summary, encrypted or unknown details have no applicable token basis'),
    ...(gpt6SolVisibleHistory || finalBinding
      ? {
          tokenizerRevision: `js-tiktoken-1.0.21/o200k-base-${definition.modelId.slice('openai/'.length)}-surrogate/1`,
        }
      : {}),
    measureFull: countBody,
  })
  const marginal = withEstimatedJsonMarginals(meter, input => {
    if (!gpt6VisibleHistory) return fullJsonMarginal(countBody, input)
    if (!input.units.length) return { kind: 'exact', tokens: 0 }
    const { tools: _tools, ...envelope } = input.envelope
    const tokens = visibleHistoryTokens(
      { ...envelope, messages: input.units },
      definition.modelId,
      tokenizer,
    )
    return tokens === undefined
      ? { kind: 'unavailable' }
      : {
          kind: 'estimated',
          tokens:
            tokens - tokenizer.encode(writeJsonLossless({ ...envelope, messages: [] })).length,
        }
  })
  if (encryptedReplay) {
    const replayMeter: InputMeter = defineInputMeter({
      ...marginal,
      replayRevision: OPENAI_56_REPLAY_REVISION,
      evidence: `Full/new basis: ${marginal.evidence}. Replay successor: OpenAI reasoning guide GPT-5.6 default all_turns and OpenRouter omitted context uses model default (2026-09-29): complete same-source encrypted output group in one unchanged assistant message maps O + zero experimental framing correction, estimated only; no live effective-mode or framing equality certification; full/new opaque remain unavailable`,
      measureReplay(input) {
        const visible = marginal.measureReplay(input)
        return visible.kind === 'unavailable' ? estimateOpenAi56Replay(input, replayMeter) : visible
      },
    })
    return replayMeter
  }
  return definition.modelId === 'openai/gpt-6-astra'
    ? defineInputMeter({
        ...marginal,
        replayRevision: 'openai-gpt-6-astra-visible-image-units-json-net-estimated/1',
      })
    : marginal
}
