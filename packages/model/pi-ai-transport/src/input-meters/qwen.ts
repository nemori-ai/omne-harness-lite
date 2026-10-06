import { qwenCommercialBindings, qwenPublicTemplateBindings } from '../official-models/qwen.ts'
import { defineInputMeter } from '../input-meter.ts'
// All eight leaves render the pinned public Qwen3.8 template and count with its pinned
// tokenizer; per-leaf template settings differ. Every OpenRouter conversion is estimated.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import { imageSize } from 'image-size'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { codePointOrder, ruleAccepts } from '../definitions.ts'
import {
  type ModelDefinition,
  type ModelRoute,
  type ParameterRule,
} from '@omne-harness-lite/model-request-runtime'
import type { InputMeter, TokenMeasurement } from '@omne-harness-lite/model-request-runtime'
import { object } from '../json.ts'
import { guardInputMeter, projectVisibleReasoningBody } from './shared.ts'

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
const visualModelId = 'qwen/qwen3.8-27b'
const tokenizerSha256 = '0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3'

function sourceFor(modelId: string): (typeof sources)[PublicQwenModelId] | undefined {
  if (modelId === 'qwen/qwen3.8-2.4t-a95b' || modelId === 'qwen/qwen3.8-27b')
    return sources[modelId]
  return undefined
}

// One verified tokenizer per pinned directory for the whole process, as the other families do;
// encoding is stateless, so every Qwen meter built from the same directory shares it.
const sharedTokenizers = new Map<string, Tokenizer>()
function tokenizer(directory: string): Tokenizer {
  const cached = sharedTokenizers.get(directory)
  if (cached) return cached
  const base = new URL(`../../resources/tokenizers/${directory}/`, import.meta.url)
  // Both pinned repositories publish byte-identical tokenizer.json files.
  const data = readFileSync(new URL('../qwen-38-24t/tokenizer.json', base))
  if (createHash('sha256').update(data).digest('hex') !== tokenizerSha256)
    throw new TypeError('Qwen tokenizer content differs from pinned source')
  const config = readFileSync(new URL('tokenizer_config.json', base), 'utf8')
  const loaded = new Tokenizer(JSON.parse(data.toString('utf8')), JSON.parse(config))
  sharedTokenizers.set(directory, loaded)
  return loaded
}

/**
 * Settings of the pinned public template that a released binding fixes. They are part of
 * the counting function, not host configuration.
 */
export interface QwenTemplateSettings {
  /**
   * Template `preserve_thinking`. True (the template default) renders every assistant's
   * think block; false renders it only for assistants after the last user query.
   */
  readonly preserveThinking: boolean
  /**
   * `xhigh`: the template default reasoning instruction. `none`: no instruction, the
   * template's `medium` frame (a rendering equivalence, not a claim about effort).
   */
  readonly effortInstruction: 'xhigh' | 'none'
  /**
   * Semantics of the template's `tojson` filter for tool definitions and non-string call
   * arguments. `sorted-keys`: Jinja2's built-in filter. `wire-order`: the transformers/vLLM
   * chat-template filter (insertion order, no ASCII or HTML escaping).
   */
  readonly toolJson: 'sorted-keys' | 'wire-order'
}

/** The settings of the two open leaves' public-template estimator. */
export const qwenOpenTemplateSettings: QwenTemplateSettings = Object.freeze({
  preserveThinking: true,
  effortInstruction: 'xhigh',
  toolJson: 'sorted-keys',
})

// Python's JSON loader changes decimal/exponent spellings before tojson; only canonical
// safe integers can be rendered directly from their wire spelling.
function integerJson(value: JsonValue): string | undefined {
  if (!isJsonNumber(value)) return undefined
  const source = jsonNumberSource(value)
  return source !== '-0' &&
    /^-?(?:0|[1-9][0-9]*)$/u.test(source) &&
    Number.isSafeInteger(Number(source))
    ? source
    : undefined
}

// Jinja's default tojson sorts keys by Unicode code point, retains separator
// spaces, escapes non-ASCII code units, and escapes HTML-sensitive characters.
function jinjaJson(value: JsonValue): string | undefined {
  if (isJsonNumber(value)) return integerJson(value)
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

const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u

// transformers' chat-template tojson: `json.dumps(value, ensure_ascii=False)`. Keys keep
// their order, separators keep their spaces, and only `"`, `\` and C0 controls are escaped,
// exactly as JSON.stringify escapes them. A lone surrogate has no Python str/UTF-8 form.
function wireOrderJson(value: JsonValue): string | undefined {
  if (isJsonNumber(value)) return integerJson(value)
  if (typeof value === 'string')
    return loneSurrogate.test(value) ? undefined : JSON.stringify(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    const items = value.map(wireOrderJson)
    return items.some(item => item === undefined) ? undefined : `[${items.join(', ')}]`
  }
  if (!object(value)) throw new TypeError('JSON object required')
  const entries: string[] = []
  for (const [key, item] of Object.entries(value)) {
    const name = wireOrderJson(key)
    const rendered = wireOrderJson(item)
    if (name === undefined || rendered === undefined) return undefined
    entries.push(`${name}: ${rendered}`)
  }
  return `{${entries.join(', ')}}`
}

// A JavaScript object lists array-index keys first, so a parsed argument string keeps its
// source key order only without them. Python's parser keeps the source order.
function keepsSourceOrder(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.every(keepsSourceOrder)
  if (!object(value)) return true
  return Object.entries(value).every(
    ([key, item]) => !/^(?:0|[1-9][0-9]*)$/u.test(key) && keepsSourceOrder(item),
  )
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
      if (!imageFieldsValid(part)) return undefined
      text += visionPlaceholder
      continue
    }
    if (!textFieldsValid(part)) return undefined
    text += part.text
  }
  return text
}

function textFieldsValid(part: JsonValue): part is JsonObject & { text: string } {
  if (!object(part) || part.type !== 'text' || typeof part.text !== 'string') return false
  if (Object.keys(part).some(key => key !== 'type' && key !== 'text' && key !== 'cache_control'))
    return false
  return true
}

function imageFieldsValid(
  part: JsonObject,
): part is JsonObject & { image_url: JsonObject & { url: string } } {
  return !(
    Object.keys(part).some(key => key !== 'type' && key !== 'image_url') ||
    !object(part.image_url) ||
    Object.keys(part.image_url).some(key => key !== 'url') ||
    typeof part.image_url.url !== 'string'
  )
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
    const message = promptMessage(raw, allowImages)
    if (!message) return undefined
    result.push(message)
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

function promptMessage(raw: JsonObject, allowImages: boolean): PromptMessage | undefined {
  const role = raw.role
  if (!promptRole(role)) return undefined
  if (!messageFieldsValid(raw, role)) return undefined
  const rendered = content(raw.content, allowImages && role === 'user')
  if (rendered === undefined) return undefined
  if (!messageReasoningValid(raw, role)) return undefined
  const calls = raw.tool_calls ?? []
  if (!Array.isArray(calls) || calls.some(call => !object(call))) return undefined
  if (role === 'tool' && typeof raw.tool_call_id !== 'string') return undefined
  return {
    role,
    content: rendered.trim(),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.trim() : '',
    toolCalls: calls.filter(object),
  }
}

function promptRole(role: JsonValue | undefined): role is PromptMessage['role'] {
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
}

function messageFieldsValid(raw: JsonObject, role: PromptMessage['role']): boolean {
  const allowed =
    role === 'assistant'
      ? ['role', 'content', 'reasoning', 'tool_calls']
      : role === 'tool'
        ? ['role', 'content', 'tool_call_id']
        : ['role', 'content']
  if (Object.keys(raw).some(key => !allowed.includes(key))) return false
  // Raw details reach here only unprojected; `reasoning_content` stays refused.
  return raw.reasoning_details === undefined && raw.reasoning_content === undefined
}

function messageReasoningValid(raw: JsonObject, role: PromptMessage['role']): boolean {
  if (role !== 'assistant' && (raw.reasoning !== undefined || raw.tool_calls !== undefined))
    return false
  if (raw.reasoning !== undefined && typeof raw.reasoning !== 'string') return false
  if (raw.tool_calls !== undefined && !Array.isArray(raw.tool_calls)) return false
  return true
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

function renderToolCalls(
  calls: readonly JsonObject[],
  priorContent: string,
  toolJson: QwenTemplateSettings['toolJson'],
): string | undefined {
  let output = ''
  for (const [index, raw] of calls.entries()) {
    const call = toolCallArguments(raw, toolJson)
    if (!call) return undefined
    const { fn, arguments: args } = call
    output += index === 0 && priorContent.trim() ? '\n\n' : index > 0 ? '\n' : ''
    output += `<tool_call>\n<function=${fn.name}>\n`
    const parameters = renderCallParameters(args, toolJson)
    if (parameters === undefined) return undefined
    output += parameters
    output += '</function>\n</tool_call>'
  }
  return output
}

function toolCallArguments(
  raw: JsonObject,
  toolJson: QwenTemplateSettings['toolJson'],
): { fn: JsonObject; arguments: JsonObject } | undefined {
  const fn = object(raw.function) ? raw.function : undefined
  if (!fn || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') return undefined
  if (!callFieldsValid(raw, fn)) return undefined
  const parsed = readJsonStrict(fn.arguments)
  if (!('ok' in parsed) || !object(parsed.ok)) return undefined
  if (toolJson === 'wire-order' && !keepsSourceOrder(parsed.ok)) return undefined
  return { fn, arguments: parsed.ok }
}

function callFieldsValid(raw: JsonObject, fn: JsonObject): boolean {
  if (Object.keys(raw).some(key => key !== 'id' && key !== 'type' && key !== 'function'))
    return false
  if (Object.keys(fn).some(key => key !== 'name' && key !== 'arguments')) return false
  return true
}

function renderCallParameters(
  args: JsonObject,
  toolJson: QwenTemplateSettings['toolJson'],
): string | undefined {
  let output = ''
  for (const [name, value] of Object.entries(args)) {
    const rendered =
      typeof value === 'string'
        ? value
        : toolJson === 'wire-order'
          ? wireOrderJson(value)
          : jinjaJson(value)
    if (rendered === undefined) return undefined
    output += `<parameter=${name}>\n${rendered}\n</parameter>\n`
  }
  return output
}

// The template's reversed scan: the last user message whose trimmed content is not
// wrapped in <tool_response>...</tool_response>. Indices include system and tool messages.
function lastQueryIndex(sequence: readonly PromptMessage[]): number {
  for (let index = sequence.length - 1; index >= 0; index--) {
    const message = sequence[index]
    if (
      message?.role === 'user' &&
      !(
        message.content.startsWith('<tool_response>') &&
        message.content.endsWith('</tool_response>')
      )
    )
      return index
  }
  return -1
}

/**
 * Public template projection for text, tools, and multi-turn history, under the pinned
 * template settings of one binding. The default is the open leaves' estimator.
 */
export function renderQwenPrompt(
  body: JsonObject,
  settings: QwenTemplateSettings = qwenOpenTemplateSettings,
): string | undefined {
  if (!templateBodyFieldsValid(body)) return undefined
  const sequence = messages(body.messages, body.model === visualModelId)
  const definitions = tools(body.tools)
  if (!sequence || !definitions) return undefined
  const first = sequence[0]
  if (!first) return undefined
  const system = renderSystem(first, definitions, settings)
  if (system === undefined) return undefined
  return renderHistory(sequence, settings, system)
}

function templateBodyFieldsValid(body: JsonObject): boolean {
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
    return false
  return true
}

function renderSystem(
  first: PromptMessage,
  definitions: readonly JsonObject[],
  settings: QwenTemplateSettings,
): string | undefined {
  const instruction = settings.effortInstruction === 'xhigh' ? xhighInstruction : ''
  const toolJson = settings.toolJson === 'wire-order' ? wireOrderJson : jinjaJson
  const systemContent = first.role === 'system' ? first.content : ''
  let prompt = ''
  if (definitions.length) {
    prompt = `<|im_start|>system\n${instruction ? `${instruction}\n\n` : ''}${toolPrefix}`
    for (const definition of definitions) {
      const rendered = toolJson(definition)
      if (rendered === undefined) return undefined
      prompt += `\n${rendered}`
    }
    prompt += toolSuffix
    if (systemContent) prompt += `\n\n${systemContent}`
    prompt += '<|im_end|>\n'
  } else if (systemContent) {
    prompt = `<|im_start|>system\n${instruction ? `${instruction}\n\n` : ''}${systemContent}<|im_end|>\n`
  } else if (instruction) {
    prompt = `<|im_start|>system\n${instruction}<|im_end|>\n`
  }
  return prompt
}

function renderHistory(
  sequence: readonly PromptMessage[],
  settings: QwenTemplateSettings,
  prompt: string,
): string | undefined {
  const lastQuery = lastQueryIndex(sequence)
  for (const [index, message] of sequence.entries()) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      prompt += `<|im_start|>user\n${message.content}<|im_end|>\n`
    } else if (message.role === 'assistant') {
      prompt +=
        settings.preserveThinking || index > lastQuery
          ? `<|im_start|>assistant\n<think>\n${message.reasoning}\n</think>\n\n${message.content}`
          : `<|im_start|>assistant\n${message.content}`
      const callText = renderToolCalls(message.toolCalls, message.content, settings.toolJson)
      if (callText === undefined) return undefined
      prompt += `${callText}<|im_end|>\n`
    } else {
      prompt += renderToolResponse(sequence, index, message)
    }
  }
  return `${prompt}<|im_start|>assistant\n<think>\n`
}

function renderToolResponse(
  sequence: readonly PromptMessage[],
  index: number,
  message: PromptMessage,
): string {
  let prompt = ''
  if (index === 0 || sequence[index - 1]?.role !== 'tool') prompt += '<|im_start|>user'
  prompt += `\n<tool_response>\n${message.content}\n</tool_response>`
  if (index === sequence.length - 1 || sequence[index + 1]?.role !== 'tool')
    prompt += '<|im_end|>\n'
  return prompt
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
      if (message.role !== 'user' || !imageFieldsValid(part)) return undefined
      const imageTokens = imagePartTokens(part)
      if (imageTokens === undefined) return undefined
      // The public template's three markers include the single image pad.
      // Alibaba's image formula counts the two surrounding vision markers.
      tokens += imageTokens - 3
    }
  }
  return tokens
}

function imagePartTokens(
  part: JsonObject & { image_url: JsonObject & { url: string } },
): number | undefined {
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
    return imageTokens
  } catch {
    return undefined
  }
}

// Alibaba's Chat API maps Qwen3.8 `high` and `max` to `xhigh`, the pinned
// template's default instruction. How OpenRouter forwards the effort object on
// this route is unpublished, so admitting these values is an estimated scope
// extension. `none` changes the thinking frame and stays unavailable.
const xhighEfforts: ReadonlySet<string> = new Set(['high', 'max'])

function withoutXhighEffort(
  body: JsonObject,
  rule: ParameterRule<JsonValue> | undefined,
): JsonObject | undefined {
  const reasoning = body.reasoning
  if (reasoning === undefined) return body
  if (
    rule === undefined ||
    !object(reasoning) ||
    Object.keys(reasoning).some(key => key !== 'effort') ||
    typeof reasoning.effort !== 'string' ||
    !xhighEfforts.has(reasoning.effort) ||
    !ruleAccepts(rule, reasoning.effort)
  )
    return undefined
  const { reasoning: _effort, ...rest } = body
  return rest
}

/**
 * Meter-only copy for the eight public-template leaves. An assistant's one visible
 * `reasoning.text` detail (shared shape, not `[REDACTED]`) whose parallel `reasoning` is
 * absent or the identical string (compared before the template's trim) reaches the public
 * template's `reasoning_content` slot exactly once, through the same plain `reasoning` path.
 * A parallel `reasoning_content` stays refused by the renderer. How OpenRouter converts
 * details for Alibaba is unknown, so the result remains an estimate.
 */
export function projectQwenMeterBody(body: JsonObject): JsonObject | undefined {
  return projectVisibleReasoningBody(body, ['reasoning'])
}

function onlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function commercialContent(value: JsonValue | undefined, systemCache: boolean): boolean {
  if (typeof value === 'string' || value === null) return true
  return Array.isArray(value) && value.every(partValid)

  function partValid(part: JsonValue): boolean {
    if (
      !object(part) ||
      part.type !== 'text' ||
      typeof part.text !== 'string' ||
      !onlyKeys(part, ['type', 'text', 'cache_control'])
    )
      return false
    if (part.cache_control === undefined) return true
    return (
      systemCache &&
      object(part.cache_control) &&
      onlyKeys(part.cache_control, ['type', 'ttl']) &&
      part.cache_control.type === 'ephemeral' &&
      part.cache_control.ttl === '5m'
    )
  }
}

/**
 * Structural preconditions the commercial leaves kept from their final-JSON estimator:
 * the exact provider object with `require_parameters: true`, a cache control only on a
 * system text block of an explicit-cache route and exactly `ephemeral`/`5m`, and the exact
 * tool, call and message member sets. The template renderer judges everything else.
 */
function commercialStructure(body: JsonObject, route: ModelRoute): boolean {
  if (!commercialBodyFieldsValid(body)) return false
  if (!commercialToolsValid(body)) return false
  const explicitCache = route.cache.mode === 'explicit'
  return body.messages.every(message => commercialMessageValid(message, explicitCache))
}

function commercialBodyFieldsValid(
  body: JsonObject,
): body is JsonObject & { messages: JsonValue[] } {
  if (
    !onlyKeys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ]) ||
    !object(body.provider) ||
    !onlyKeys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) ||
    body.provider.require_parameters !== true ||
    (body.stream !== undefined && typeof body.stream !== 'boolean') ||
    (body.store !== undefined && typeof body.store !== 'boolean') ||
    (body.max_tokens !== undefined && !isNonNegativeJsonInteger(body.max_tokens)) ||
    !Array.isArray(body.messages)
  )
    return false
  return true
}

function commercialToolsValid(body: JsonObject): boolean {
  if (
    body.tools !== undefined &&
    (!Array.isArray(body.tools) ||
      body.tools.some(
        tool =>
          !object(tool) ||
          !onlyKeys(tool, ['type', 'function']) ||
          tool.type !== 'function' ||
          !object(tool.function) ||
          !onlyKeys(tool.function, ['name', 'description', 'parameters']) ||
          typeof tool.function.name !== 'string' ||
          (tool.function.description !== undefined &&
            typeof tool.function.description !== 'string') ||
          !object(tool.function.parameters),
      ))
  )
    return false
  return true
}

function commercialMessageValid(message: JsonValue, explicitCache: boolean): boolean {
  if (
    !object(message) ||
    !onlyKeys(message, [
      'role',
      'content',
      'reasoning',
      'reasoning_details',
      'tool_calls',
      'tool_call_id',
    ]) ||
    !commercialContent(message.content, explicitCache && message.role === 'system')
  )
    return false
  if (
    message.role !== 'assistant' &&
    (message.reasoning !== undefined ||
      message.reasoning_details !== undefined ||
      message.tool_calls !== undefined)
  )
    return false
  if (
    message.role === 'tool'
      ? typeof message.tool_call_id !== 'string'
      : message.tool_call_id !== undefined
  )
    return false
  return commercialCallsValid(message)
}

function commercialCallsValid(message: JsonObject): boolean {
  return (
    message.tool_calls === undefined ||
    (Array.isArray(message.tool_calls) &&
      message.tool_calls.every(
        call =>
          object(call) &&
          onlyKeys(call, ['id', 'type', 'function']) &&
          typeof call.id === 'string' &&
          call.type === 'function' &&
          object(call.function) &&
          onlyKeys(call.function, ['name', 'arguments']) &&
          typeof call.function.name === 'string' &&
          typeof call.function.arguments === 'string',
      ))
  )
}

/** Pinned public-template estimates for the eight exact Alibaba leaves. */
export function createQwenInputMeter(definition: ModelDefinition): InputMeter {
  const source = sourceFor(definition.modelId)
  const commercial = Object.hasOwn(qwenCommercialBindings, definition.modelId)
    ? qwenCommercialBindings[definition.modelId]
    : undefined
  const binding =
    commercial ??
    (Object.hasOwn(qwenPublicTemplateBindings, definition.modelId)
      ? qwenPublicTemplateBindings[definition.modelId]
      : undefined)
  const route = definition.routes.alibaba
  if ((!source && !commercial) || !bindingValid(definition, binding) || !route)
    throw new TypeError('unsupported Qwen definition')
  const effortRule = route.parameters.reasoningEffort
  const settings = commercial?.template ?? qwenOpenTemplateSettings
  const encoder = tokenizer(source?.directory ?? 'qwen-38-24t')
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'alibaba',
    algorithmRevision:
      commercial?.algorithmRevision ??
      (definition.modelId === visualModelId
        ? 'qwen-38-public-template-image-effort-5'
        : 'qwen-38-public-template-effort-4'),
    // Open leaves: the tokenizer and template are unchanged; only the projected domain grew.
    // Commercial leaves: the render basis changed class, so the value is explicit and new.
    tokenizerRevision:
      commercial?.tokenizerRevision ??
      (definition.modelId === visualModelId
        ? 'tokenizer-basis/qwen-38-public-template-image-effort-4'
        : 'tokenizer-basis/qwen-38-public-template-effort-3'),
    evidence:
      commercial?.evidence ??
      `${source?.repository} ${source?.commit} public chat_template.jinja and tokenizer.json sha256:${tokenizerSha256}; ${definition.modelId === visualModelId ? 'Alibaba Qwen3.8 32x32 image formula, unscaled inline PNG only;' : 'text/tools subset;'} OpenRouter/Alibaba conversion remains estimated; declared high/max request effort renders the template default xhigh instruction per Alibaba's documented high/max-to-xhigh mapping, an estimated scope extension with no actual effort holdout or error bound; one visible reasoning.text detail per assistant is projected into the public template reasoning_content slot, OpenRouter details conversion unknown, no holdout; none, other effort shapes and every other reasoning_details shape (summary, encrypted, redacted or extra keys) remain unavailable`,
    measureFull({ body, serialized }): TokenMeasurement {
      if (
        !measurementBodyValid(body, definition, serialized) ||
        (commercial !== undefined && !commercialStructure(body, route))
      )
        return { kind: 'unavailable' }
      // Effort stripping and the details projection touch disjoint fields; rendering and
      // image counting read the same meter-only copy. Routes that drop effort admit none.
      const effortless = withoutXhighEffort(body, effortRule)
      const template = effortless && projectQwenMeterBody(effortless)
      const prompt = template && renderQwenPrompt(template, settings)
      if (prompt === undefined) return { kind: 'unavailable' }
      const imageTokens =
        definition.modelId === visualModelId && template ? inlineImageTokens(template) : 0
      if (imageTokens === undefined) return { kind: 'unavailable' }
      try {
        return {
          kind: 'estimated',
          tokens: encoder.encode(prompt, { add_special_tokens: false }).ids.length + imageTokens,
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  // All eight factory methods run the shared source/basis guards.
  return guardInputMeter(raw)
}

function measurementBodyValid(
  body: JsonObject,
  definition: ModelDefinition,
  serialized: string,
): boolean {
  return (
    body.model === definition.modelId &&
    providerValid(body) &&
    writeJsonLossless(body) === serialized
  )
}

function bindingValid(
  definition: ModelDefinition,
  binding: { readonly revision: string; readonly implementationRevision: string } | undefined,
): boolean {
  return !(
    !binding ||
    definition.revision !== binding.revision ||
    definition.implementation.name !== 'pi-ai:qwen' ||
    definition.implementation.revision !== binding.implementationRevision ||
    !Object.hasOwn(definition.routes, 'alibaba')
  )
}

function providerValid(body: JsonObject): boolean {
  return !(
    !object(body.provider) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'alibaba' ||
    body.provider.allow_fallbacks !== false
  )
}
