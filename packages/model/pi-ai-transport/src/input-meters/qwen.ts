import { defineInputMeter } from '../input-meter.ts'
// Narrow projections from pinned Qwen3.8 public templates and Alibaba's
// published hosted-Max example. OpenRouter conversion remains estimated.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import { imageSize } from 'image-size'
import {
  isJsonNumber,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { codePointOrder, type ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { object } from '../json.ts'

const sources = {
  'qwen/qwen3.8-2.4t-a95b': {
    directory: 'qwen-38-24t',
    repository: 'Qwen/Qwen3.8-2.4T-A95B',
    commit: '207bd685a7e3696cfaff12ded7c6a7ea0f88c996',
  },
  'qwen/qwen3.8-27b': {
    directory: 'qwen-38-27b',
    repository: 'Qwen/Qwen3.8-27B',
    commit: '1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0',
  },
} as const
type PublicQwenModelId = keyof typeof sources
const hostedMaxModelId = 'qwen/qwen3.8-max-0902'
const hostedFlashModelId = 'qwen/qwen3.8-flash'
const hosted37FlashModelId = 'qwen/qwen3.7-flash'
const hosted37PlusModelId = 'qwen/qwen3.7-plus'
const hosted37MaxModelId = 'qwen/qwen3.7-max'
const visualModelId = 'qwen/qwen3.8-27b'
// Fixed-route observations: three text calibrations plus an untouched fourth
// holdout had the same difference from the published ChatML/tokenizer proxy.
const hostedMaxRouteOffset = 51
const hostedFinalTextRoutes = {
  [hostedFlashModelId]: {
    implementationRevision: 'mp4-4',
    algorithmRevision: 'qwen-38-hosted-flash-chatml-offset-1',
    offset: 51,
    evidence:
      'Qwen/Qwen3.8-2.4T-A95B public tokenizer and hosted-Max published ChatML wrapper are only a proxy; exact OpenRouter qwen/qwen3.8-flash Alibaba final text-array wire three calibrations +51 and untouched holdout +51, result sha256:32a526bb147b4fffd26de4e669d6132592190ce1100d88c6fc81b74fed8d6c11, independent generation verification sha256:bbc15cae1443828472b6d026ae2894c01bc144413da00c1ded306be103952c03; single-user text-part estimate only',
  },
  [hosted37FlashModelId]: {
    implementationRevision: 'mp4-5',
    algorithmRevision: 'qwen-37-hosted-flash-chatml-offset-1',
    offset: 0,
    evidence:
      'Qwen/Qwen3.8-2.4T-A95B public tokenizer and hosted-Max published ChatML wrapper are only a proxy; exact OpenRouter qwen/qwen3.7-flash Alibaba final text-array wire three calibrations +0 and untouched holdout +0, four original observation sha256:c59e5998555714ad12125bf4e0a6106ffc19b4056e86ab83ff63160d64a086e6/8ed2d813c4dc6516a47e76357820b636384ac8edeec552b55de32187e29351a6/91728d0980386b9b6d16d327ff1a27c9d244a695e92b43b5d82f562847427d62/6aae593a5739617af9957e1d94452ed92e6e8dd176fd2e2db10cd4bfa4095466, generation verification sha256:953e8aaa5f0bfc70a1110faa74364a3c279e4467d33686789ff8ecfd8c5000fc; single-user text-part estimate only',
  },
  [hosted37PlusModelId]: {
    implementationRevision: 'mp4-5',
    algorithmRevision: 'qwen-37-hosted-plus-chatml-offset-1',
    offset: 0,
    evidence:
      'Qwen/Qwen3.8-2.4T-A95B public tokenizer and hosted-Max published ChatML wrapper are only a proxy; exact OpenRouter qwen/qwen3.7-plus Alibaba final text-array wire three calibrations +0 and untouched holdout +0, independent generation verification sha256:747bc040657396a640fa1e4c0e0fb1f8b403b78cc9e6d50002eab128f40b6056; single-user text-part estimate only',
  },
  [hosted37MaxModelId]: {
    implementationRevision: 'mp4-5',
    algorithmRevision: 'qwen-37-hosted-max-chatml-offset-1',
    offset: 0,
    evidence:
      'Qwen/Qwen3.8-2.4T-A95B public tokenizer and hosted-Max published ChatML wrapper are only a proxy; exact OpenRouter qwen/qwen3.7-max Alibaba final text-array wire three calibrations +0 and untouched holdout +0, independent generation verification sha256:05a86372c5c7c60591ae47292240d22fea371c475bf7334d8a1dae5ce3fa70fe; single-user text-part estimate only',
  },
} as const
const tokenizerSha256 = '0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3'

function hostedFinalTextRoute(modelId: string) {
  if (
    modelId === hostedFlashModelId ||
    modelId === hosted37FlashModelId ||
    modelId === hosted37PlusModelId ||
    modelId === hosted37MaxModelId
  )
    return hostedFinalTextRoutes[modelId]
  return undefined
}

function sourceFor(modelId: string): (typeof sources)[PublicQwenModelId] | undefined {
  if (modelId === 'qwen/qwen3.8-2.4t-a95b' || modelId === 'qwen/qwen3.8-27b')
    return sources[modelId]
  return undefined
}

function tokenizer(directory: string): Tokenizer {
  const base = new URL(`../../tokenizers/${directory}/`, import.meta.url)
  // Both pinned repositories publish byte-identical tokenizer.json files.
  const data = readFileSync(new URL('../qwen-38-24t/tokenizer.json', base))
  if (createHash('sha256').update(data).digest('hex') !== tokenizerSha256)
    throw new TypeError('Qwen tokenizer content differs from pinned source')
  const config = readFileSync(new URL('tokenizer_config.json', base), 'utf8')
  return new Tokenizer(JSON.parse(data.toString('utf8')), JSON.parse(config))
}

// Jinja's default tojson sorts keys by Unicode code point, retains separator
// spaces, escapes non-ASCII code units, and escapes HTML-sensitive characters.
// Python's JSON loader changes decimal/exponent spellings before tojson; only
// canonical safe integers can be rendered directly from their wire spelling.
function jinjaJson(value: JsonValue): string | undefined {
  if (isJsonNumber(value)) {
    const source = jsonNumberSource(value)
    return source !== '-0' &&
      /^-?(?:0|[1-9][0-9]*)$/u.test(source) &&
      Number.isSafeInteger(Number(source))
      ? source
      : undefined
  }
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
      .replace(
        /[\u007f-\uffff]/g,
        character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      )
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/'/g, '\\u0027')
  if (Array.isArray(value)) {
    const items = value.map(jinjaJson)
    return items.some(item => item === undefined) ? undefined : `[${items.join(', ')}]`
  }
  if (!object(value)) throw new TypeError('JSON object required')
  const entries: string[] = []
  for (const key of Object.keys(value).sort(codePointOrder)) {
    const rendered = jinjaJson(value[key] ?? null)
    if (rendered === undefined) return undefined
    entries.push(`${jinjaJson(key)}: ${rendered}`)
  }
  return `{${entries.join(', ')}}`
}

const visionPlaceholder = '<|vision_start|><|image_pad|><|vision_end|>'
const inlinePng = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u

function content(value: JsonValue | undefined, allowImages: boolean): string | undefined {
  if (typeof value === 'string') return value
  if (value === null) return ''
  if (!Array.isArray(value)) return undefined
  let text = ''
  for (const part of value) {
    if (allowImages && object(part) && part.type === 'image_url') {
      if (
        Object.keys(part).some(key => key !== 'type' && key !== 'image_url') ||
        !object(part.image_url) ||
        Object.keys(part.image_url).some(key => key !== 'url') ||
        typeof part.image_url.url !== 'string'
      )
        return undefined
      text += visionPlaceholder
      continue
    }
    if (!object(part) || part.type !== 'text' || typeof part.text !== 'string') return undefined
    if (Object.keys(part).some(key => key !== 'type' && key !== 'text' && key !== 'cache_control'))
      return undefined
    text += part.text
  }
  return text
}

type PromptMessage = {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string
  readonly reasoning: string
  readonly toolCalls: readonly JsonObject[]
}

function messages(value: JsonValue | undefined, allowImages: boolean): PromptMessage[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const result: PromptMessage[] = []
  for (const raw of value) {
    if (!object(raw)) return undefined
    const role = raw.role
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool')
      return undefined
    const allowed =
      role === 'assistant'
        ? ['role', 'content', 'reasoning', 'tool_calls']
        : role === 'tool'
          ? ['role', 'content', 'tool_call_id']
          : ['role', 'content']
    if (Object.keys(raw).some(key => !allowed.includes(key))) return undefined
    if (raw.reasoning_details !== undefined || raw.reasoning_content !== undefined) return undefined
    const rendered = content(raw.content, allowImages && role === 'user')
    if (rendered === undefined) return undefined
    if (role !== 'assistant' && (raw.reasoning !== undefined || raw.tool_calls !== undefined))
      return undefined
    if (raw.reasoning !== undefined && typeof raw.reasoning !== 'string') return undefined
    if (raw.tool_calls !== undefined && !Array.isArray(raw.tool_calls)) return undefined
    const calls = raw.tool_calls ?? []
    if (!Array.isArray(calls) || calls.some(call => !object(call))) return undefined
    if (role === 'tool' && typeof raw.tool_call_id !== 'string') return undefined
    result.push({
      role,
      content: rendered.trim(),
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.trim() : '',
      toolCalls: calls.filter(object),
    })
  }
  if (
    !result.some(
      message =>
        message.role === 'user' &&
        !(
          message.content.startsWith('<tool_response>') &&
          message.content.endsWith('</tool_response>')
        ),
    )
  )
    return undefined
  if (result.some((message, index) => message.role === 'system' && index !== 0)) return undefined
  return result
}

const xhighInstruction =
  'Reasoning effort is set to xhigh. Please think carefully through the task, validate key assumptions, consider plausible alternatives, and prioritize correctness, consistency, and clarity in the final answer.'
const toolPrefix = '# Tools\n\nYou have access to the following functions:\n\n<tools>'
const toolSuffix =
  '\n</tools>\n\nIf you choose to call a function ONLY reply in the following format with NO suffix:\n\n<tool_call>\n<function=example_function_name>\n<parameter=example_parameter_1>\nvalue_1\n</parameter>\n<parameter=example_parameter_2>\nThis is the value for the second parameter\nthat can span\nmultiple lines\n</parameter>\n</function>\n</tool_call>\n\n<IMPORTANT>\nReminder:\n- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags\n- Required parameters MUST be specified\n- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after\n- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls\n</IMPORTANT>'

function tools(value: JsonValue | undefined): JsonObject[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) return undefined
  const result: JsonObject[] = []
  for (const item of value) {
    if (!object(item) || item.type !== 'function' || !object(item.function)) return undefined
    if (typeof item.function.name !== 'string' || !object(item.function.parameters))
      return undefined
    if (
      Object.keys(item).some(key => key !== 'type' && key !== 'function' && key !== 'cache_control')
    )
      return undefined
    result.push(item)
  }
  return result
}

function renderToolCalls(calls: readonly JsonObject[], priorContent: string): string | undefined {
  let output = ''
  for (const [index, raw] of calls.entries()) {
    const fn = object(raw.function) ? raw.function : undefined
    if (!fn || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') return undefined
    if (Object.keys(raw).some(key => key !== 'id' && key !== 'type' && key !== 'function'))
      return undefined
    if (Object.keys(fn).some(key => key !== 'name' && key !== 'arguments')) return undefined
    const parsed = readJsonStrict(fn.arguments)
    if (!('ok' in parsed) || !object(parsed.ok)) return undefined
    output += index === 0 && priorContent.trim() ? '\n\n' : index > 0 ? '\n' : ''
    output += `<tool_call>\n<function=${fn.name}>\n`
    for (const [name, value] of Object.entries(parsed.ok)) {
      const rendered = typeof value === 'string' ? value : jinjaJson(value)
      if (rendered === undefined) return undefined
      output += `<parameter=${name}>\n${rendered}\n</parameter>\n`
    }
    output += '</function>\n</tool_call>'
  }
  return output
}

/** Public template projection for text, tools, and multi-turn history. */
export function renderQwenPrompt(body: JsonObject): string | undefined {
  if (
    Object.keys(body).some(
      key =>
        key !== 'model' &&
        key !== 'provider' &&
        key !== 'stream' &&
        key !== 'store' &&
        key !== 'messages' &&
        key !== 'tools' &&
        key !== 'max_tokens' &&
        key !== 'reasoning',
    ) ||
    body.reasoning !== undefined
  )
    return undefined
  const sequence = messages(body.messages, body.model === visualModelId)
  const definitions = tools(body.tools)
  if (!sequence || !definitions) return undefined
  const first = sequence[0]
  if (!first) return undefined
  let prompt = ''
  if (definitions.length) {
    prompt = `<|im_start|>system\n${xhighInstruction}\n\n${toolPrefix}`
    for (const definition of definitions) {
      const rendered = jinjaJson(definition)
      if (rendered === undefined) return undefined
      prompt += `\n${rendered}`
    }
    prompt += toolSuffix
    if (first.role === 'system' && first.content) prompt += `\n\n${first.content}`
    prompt += '<|im_end|>\n'
  } else if (first.role === 'system') {
    prompt = `<|im_start|>system\n${xhighInstruction}${first.content ? `\n\n${first.content}` : ''}<|im_end|>\n`
  } else {
    prompt = `<|im_start|>system\n${xhighInstruction}<|im_end|>\n`
  }
  for (const [index, message] of sequence.entries()) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      prompt += `<|im_start|>user\n${message.content}<|im_end|>\n`
    } else if (message.role === 'assistant') {
      prompt += `<|im_start|>assistant\n<think>\n${message.reasoning}\n</think>\n\n${message.content}`
      const callText = renderToolCalls(message.toolCalls, message.content)
      if (callText === undefined) return undefined
      prompt += `${callText}<|im_end|>\n`
    } else {
      if (index === 0 || sequence[index - 1]?.role !== 'tool') prompt += '<|im_start|>user'
      prompt += `\n<tool_response>\n${message.content}\n</tool_response>`
      if (index === sequence.length - 1 || sequence[index + 1]?.role !== 'tool')
        prompt += '<|im_end|>\n'
    }
  }
  return `${prompt}<|im_start|>assistant\n<think>\n`
}

/** Single-user text projection from Alibaba's published Qwen3.8-Max example. */
export function renderQwenHostedMaxPrompt(body: JsonObject): string | undefined {
  if (
    body.model !== hostedMaxModelId ||
    Object.keys(body).some(
      key =>
        key !== 'model' &&
        key !== 'provider' &&
        key !== 'stream' &&
        key !== 'store' &&
        key !== 'messages' &&
        key !== 'tools' &&
        key !== 'max_tokens',
    )
  )
    return undefined
  const sequence = messages(body.messages, false)
  const definitions = tools(body.tools)
  if (!sequence || sequence.length !== 1 || sequence[0]?.role !== 'user' || !definitions)
    return undefined
  if (definitions.length) return undefined
  return `<|im_start|>user\n${sequence[0].content}<|im_end|>\n<|im_start|>assistant\n<think>\n`
}

/** Final planner's single text-part user shape for a calibrated hosted route. */
function renderHostedFinalTextPrompt(body: JsonObject, modelId: string): string | undefined {
  if (
    body.model !== modelId ||
    body.stream !== true ||
    body.store !== false ||
    !object(body.provider) ||
    body.provider.require_parameters !== true ||
    Object.keys(body.provider).some(
      key => key !== 'order' && key !== 'allow_fallbacks' && key !== 'require_parameters',
    ) ||
    typeof body.max_tokens !== 'number' ||
    !Number.isSafeInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    Object.keys(body).some(
      key =>
        key !== 'model' &&
        key !== 'provider' &&
        key !== 'stream' &&
        key !== 'store' &&
        key !== 'messages' &&
        key !== 'max_tokens',
    ) ||
    !Array.isArray(body.messages) ||
    body.messages.length !== 1
  )
    return undefined
  const message = body.messages[0]
  if (
    !object(message) ||
    message.role !== 'user' ||
    Object.keys(message).some(key => key !== 'role' && key !== 'content') ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  )
    return undefined
  const part = message.content[0]
  if (
    !object(part) ||
    part.type !== 'text' ||
    typeof part.text !== 'string' ||
    part.text.length === 0 ||
    Object.keys(part).some(key => key !== 'type' && key !== 'text')
  )
    return undefined
  return `<|im_start|>user\n${part.text}<|im_end|>\n<|im_start|>assistant\n<think>\n`
}

export function renderQwenHostedFlashPrompt(body: JsonObject): string | undefined {
  return renderHostedFinalTextPrompt(body, hostedFlashModelId)
}

/** Alibaba's image formula for source dimensions requiring no resize. */
export function qwenUnscaledImageTokens(width: number, height: number): number | undefined {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 32 ||
    height < 32 ||
    width % 32 !== 0 ||
    height % 32 !== 0
  )
    return undefined
  const pixels = width * height
  if (pixels < 65_536 || pixels > 2_621_440) return undefined
  return pixels / 1_024 + 2
}

function inlineImageTokens(body: JsonObject): number | undefined {
  if (!Array.isArray(body.messages)) return undefined
  let tokens = 0
  for (const message of body.messages) {
    if (!object(message) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!object(part) || part.type !== 'image_url') continue
      if (
        message.role !== 'user' ||
        Object.keys(part).some(key => key !== 'type' && key !== 'image_url') ||
        !object(part.image_url) ||
        Object.keys(part.image_url).some(key => key !== 'url') ||
        typeof part.image_url.url !== 'string'
      )
        return undefined
      const encoded = inlinePng.exec(part.image_url.url)?.[1]
      if (!encoded) return undefined
      const bytes = Buffer.from(encoded, 'base64')
      if (!bytes.length || bytes.length > 4 * 1024 * 1024 || bytes.toString('base64') !== encoded)
        return undefined
      try {
        const dimensions = imageSize(bytes)
        if (dimensions.type !== 'png') return undefined
        const imageTokens = qwenUnscaledImageTokens(dimensions.width, dimensions.height)
        if (imageTokens === undefined) return undefined
        // The public template's three markers include the single image pad.
        // Alibaba's image formula counts the two surrounding vision markers.
        tokens += imageTokens - 3
      } catch {
        return undefined
      }
    }
  }
  return tokens
}

/** Pinned-tokenizer estimates for the supported exact Alibaba leaves. */
export function createQwenInputMeter(definition: ModelDefinition): InputMeter {
  const source = sourceFor(definition.modelId)
  const hostedMax = definition.modelId === hostedMaxModelId
  const hostedFinalText = hostedFinalTextRoute(definition.modelId)
  if (
    (!source && !hostedMax && !hostedFinalText) ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:qwen' ||
    definition.implementation.revision !==
      (hostedFinalText
        ? hostedFinalText.implementationRevision
        : hostedMax || definition.modelId === visualModelId
          ? 'mp4-3'
          : 'mp4-2') ||
    !Object.hasOwn(definition.routes, 'alibaba')
  )
    throw new TypeError('unsupported Qwen definition')
  const encoder = tokenizer(source?.directory ?? 'qwen-38-24t')
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'alibaba',
    algorithmRevision: hostedFinalText
      ? hostedFinalText.algorithmRevision
      : hostedMax
        ? 'qwen-38-hosted-max-chatml-offset-2'
        : definition.modelId === visualModelId
          ? 'qwen-38-public-template-image-3'
          : 'qwen-38-public-template-2',
    evidence: hostedFinalText
      ? `${hostedFinalText.evidence}; tokenizer.json sha256:${tokenizerSha256}`
      : hostedMax
        ? `https://help.aliyun.com/en/model-studio/text-generation Qwen3.8-Max Hi/11-token ChatML example; Qwen/Qwen3.8-2.4T-A95B tokenizer.json sha256:${tokenizerSha256}; OpenRouter Alibaba fixed-route three text calibrations +51 and untouched holdout +51, observations sha256:464c029984e310a928b3ae74a152e2d15726d6d456dfb154aca8d593d25822e, provider verification sha256:1bb421e92fc128045d1dfdb24907aba73e7c5ba9bafc1af2b79eb6b6ad880836; single-user text estimate only`
        : `${source?.repository} ${source?.commit} public chat_template.jinja and tokenizer.json sha256:${tokenizerSha256}; ${definition.modelId === visualModelId ? 'Alibaba Qwen3.8 32x32 image formula, unscaled inline PNG only;' : 'text/tools subset;'} OpenRouter/Alibaba conversion remains estimated`,
    measureFull({ body, serialized }): TokenMeasurement {
      if (
        body.model !== definition.modelId ||
        !object(body.provider) ||
        !Array.isArray(body.provider.order) ||
        body.provider.order.length !== 1 ||
        body.provider.order[0] !== 'alibaba' ||
        body.provider.allow_fallbacks !== false ||
        writeJsonLossless(body) !== serialized
      )
        return { kind: 'unavailable' }
      const prompt = hostedFinalText
        ? renderHostedFinalTextPrompt(body, definition.modelId)
        : hostedMax
          ? renderQwenHostedMaxPrompt(body)
          : renderQwenPrompt(body)
      if (prompt === undefined) return { kind: 'unavailable' }
      const imageTokens = definition.modelId === visualModelId ? inlineImageTokens(body) : 0
      if (imageTokens === undefined) return { kind: 'unavailable' }
      try {
        return {
          kind: 'estimated',
          tokens:
            encoder.encode(prompt, { add_special_tokens: false }).ids.length +
            imageTokens +
            (hostedFinalText ? hostedFinalText.offset : hostedMax ? hostedMaxRouteOffset : 0),
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return Object.freeze(meter)
}
