import { defineInputMeter } from '../input-meter.ts'
// Prompt projections adapted from Moonshot K3 encoding_k3.py at f831ab6 and
// K2.7 Code chat_template.jinja at 74797c9; see tokenizers/moonshot/provenance.json.
// OpenRouter may transform the prompt, so both results are estimates.
import {
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { object } from '../json.ts'
import { moonshotDefinitions } from '../official-models/moonshot.ts'
import { countSegments, moonshotTokenizer } from './moonshot-tokenizer.ts'
import { guardInputMeter, projectVisibleReasoningBody } from './shared.ts'
import { imageSize } from 'image-size'

type Segment = { readonly text: string; readonly control: boolean }
type Route = 'k3' | 'k27'
const unavailable = { kind: 'unavailable' } as const
const inlineImage =
  /^data:(image\/(?:png|jpeg|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u

function imageDimensions(part: JsonValue): { width: number; height: number } | undefined {
  if (
    !object(part) ||
    part.type !== 'image_url' ||
    Object.keys(part).some(key => key !== 'type' && key !== 'image_url')
  )
    return undefined
  const image = part.image_url
  if (
    !object(image) ||
    Object.keys(image).some(key => key !== 'url') ||
    typeof image.url !== 'string'
  )
    return undefined
  const match = inlineImage.exec(image.url)
  if (!match?.[1] || !match[2]) return undefined
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.toString('base64') !== match[2]) return undefined
  try {
    const dimensions = imageSize(bytes)
    if (dimensions.type !== (match[1] === 'image/jpeg' ? 'jpg' : match[1].slice(6)))
      return undefined
    if (
      !Number.isSafeInteger(dimensions.width) ||
      !Number.isSafeInteger(dimensions.height) ||
      dimensions.width < 1 ||
      dimensions.height < 1
    )
      return undefined
    return { width: dimensions.width, height: dimensions.height }
  } catch {
    return undefined
  }
}

// Moonshot's pinned media_utils.py navit_resize_image with model-specific
// preprocessor_config.json. This is a reference serving estimate, not an
// OpenRouter token count or a conservative upper bound.
export function referenceMoonshotImageTokens(
  route: Route,
  width: number,
  height: number,
): number | undefined {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 65535 ||
    height > 65535
  )
    return undefined
  const patch = 14
  const merge = 2
  const sideLimit = 512
  const patchLimit = route === 'k3' ? 65536 : 16384
  const scale = Math.min(
    1,
    Math.sqrt(
      patchLimit /
        (Math.max(1, Math.floor(width / patch)) * Math.max(1, Math.floor(height / patch))),
    ),
    (sideLimit * patch) / width,
    (sideLimit * patch) / height,
  )
  const resizedWidth = Math.min(Math.max(1, Math.trunc(width * scale)), sideLimit * patch)
  const resizedHeight = Math.min(Math.max(1, Math.trunc(height * scale)), sideLimit * patch)
  const factor = merge * patch
  return Math.ceil(resizedWidth / factor) * Math.ceil(resizedHeight / factor)
}

function imageSegments(route: Route, dimensions: { width: number; height: number }): Segment[] {
  return [
    control('<|media_begin|>'),
    text(route === 'k3' ? `image ${dimensions.width}x${dimensions.height}` : 'image'),
    control('<|media_content|>'),
    control('<|media_pad|>'),
    control('<|media_end|>'),
  ]
}

function mediaTokens(route: Route, history: readonly JsonObject[]): number | undefined {
  let tokens = 0
  for (const message of history) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!object(part) || part.type !== 'image_url') continue
      if (message.role !== 'user') return undefined
      const dimensions = imageDimensions(part)
      if (!dimensions) return undefined
      const count = referenceMoonshotImageTokens(route, dimensions.width, dimensions.height)
      if (count === undefined) return undefined
      tokens += count - 1 // the prompt already contains one media_pad token
    }
  }
  return tokens
}
const accountedBodyFields = new Set([
  'model',
  'messages',
  'tools',
  'reasoning',
  // Transport and generation controls do not enter the public input template.
  'provider',
  'stream',
  'stream_options',
  'store',
  'max_tokens',
  'temperature',
  'top_p',
  'seed',
  'stop',
  'frequency_penalty',
  'presence_penalty',
])

function deepSort(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object' || isJsonNumber(value)) return value
  if (Array.isArray(value)) return value.map(deepSort)
  const sorted: { [key: string]: JsonValue } = {}
  for (const [key, item] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    sorted[key] = deepSort(item)
  return sorted
}

function jinjaJson(value: JsonValue): string {
  return writeJsonLossless(deepSort(value))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll("'", '\\u0027')
}

function text(value: string): Segment {
  return { text: value, control: false }
}
function control(value: string): Segment {
  return { text: value, control: true }
}
function contents(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (!Array.isArray(value)) return undefined
  let result = ''
  for (const part of value) {
    if (object(part) && part.type === 'image_url' && imageDimensions(part)) continue
    if (
      !object(part) ||
      part.type !== 'text' ||
      typeof part.text !== 'string' ||
      Object.keys(part).some(key => key !== 'type' && key !== 'text')
    )
      return undefined
    result += part.text
  }
  return result
}

function contentSegments(route: Route, value: JsonValue | undefined): Segment[] | undefined {
  if (typeof value === 'string') return [text(value)]
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) return undefined
  const segments: Segment[] = []
  for (const part of value) {
    if (!object(part)) return undefined
    if (part.type === 'image_url') {
      const dimensions = imageDimensions(part)
      if (!dimensions) return undefined
      segments.push(...imageSegments(route, dimensions))
    } else if (
      part.type === 'text' &&
      typeof part.text === 'string' &&
      Object.keys(part).every(key => key === 'type' || key === 'text')
    )
      segments.push(text(part.text))
    else return undefined
  }
  return segments
}
function messages(body: JsonObject): readonly JsonObject[] | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const result: JsonObject[] = []
  for (const item of body.messages) {
    if (!object(item) || typeof item.role !== 'string' || contents(item.content) === undefined)
      return undefined
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(item.role)) return undefined
    if (
      item.role !== 'user' &&
      Array.isArray(item.content) &&
      item.content.some(part => object(part) && part.type === 'image_url')
    )
      return undefined
    // Raw details reach here only unprojected; the public templates do not explain them.
    if (item.reasoning_details !== undefined) return undefined
    if (
      Object.keys(item).some(
        key =>
          ![
            'role',
            'name',
            'content',
            'reasoning',
            'reasoning_content',
            'tool_calls',
            'tool_call_id',
          ].includes(key),
      )
    )
      return undefined
    if (item.name !== undefined && typeof item.name !== 'string') return undefined
    result.push(item)
  }
  return result
}
function tools(body: JsonObject): readonly JsonObject[] | undefined {
  if (body.tools === undefined) return []
  if (!Array.isArray(body.tools)) return undefined
  const result: JsonObject[] = []
  for (const item of body.tools) {
    if (!object(item) || !object(item.function)) return undefined
    result.push(item)
  }
  return result
}
function calls(message: JsonObject): readonly JsonObject[] | undefined {
  if (message.tool_calls === undefined) return []
  if (!Array.isArray(message.tool_calls)) return undefined
  const result: JsonObject[] = []
  for (const item of message.tool_calls) {
    if (!object(item) || !object(item.function) || typeof item.function.name !== 'string')
      return undefined
    if (typeof item.function.arguments !== 'string') return undefined
    if (item.id !== undefined && typeof item.id !== 'string') return undefined
    if (item.type !== undefined && item.type !== 'function') return undefined
    if (Object.keys(item).some(key => !['id', 'type', 'function'].includes(key))) return undefined
    if (Object.keys(item.function).some(key => !['name', 'arguments'].includes(key)))
      return undefined
    result.push(item)
  }
  return result
}
function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}
function open(tag: string, attributes: readonly (readonly [string, string])[] = []): Segment[] {
  const result = [control('<|open|>'), text(tag)]
  for (const [name, value] of attributes)
    result.push(text(` ${name}`), text('="'), text(escapeAttribute(value)), text('"'))
  result.push(control('<|sep|>'))
  return result
}
function close(tag: string): Segment[] {
  return [control('<|close|>'), text(tag), control('<|sep|>')]
}
function systemK3(kind: string, body: string): Segment[] {
  return [
    ...open('message', [
      ['role', 'system'],
      ['type', kind],
    ]),
    text(body.trim()),
    ...close('message'),
    control('<|end_of_msg|>'),
  ]
}
function argumentType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value === 'number' ? 'number' : typeof value
}
function toolCallK3(call: JsonObject, index: number): Segment[] | undefined {
  const fn = call.function
  if (!object(fn) || typeof fn.name !== 'string' || typeof fn.arguments !== 'string')
    return undefined
  const result = [
    ...open('call', [
      ['tool', fn.name],
      ['index', String(index)],
    ]),
  ]
  let parsed: unknown
  try {
    parsed = JSON.parse(fn.arguments)
  } catch {
    parsed = undefined
  }
  if (parsed === undefined || !object(parsed)) {
    result.push(...open('json', [['type', 'object']]), text(fn.arguments), ...close('json'))
  } else {
    for (const [key, value] of Object.entries(parsed)) {
      result.push(
        ...open('argument', [
          ['key', key],
          ['type', argumentType(value)],
        ]),
      )
      result.push(text(typeof value === 'string' ? value : JSON.stringify(value)))
      result.push(...close('argument'))
    }
  }
  result.push(...close('call'))
  return result
}
function orderedK3History(history: readonly JsonObject[]): readonly JsonObject[] {
  // encoding_k3.py sorts each consecutive result run by the preceding
  // assistant's call IDs. An unresolved run retains its original order.
  const ordered: JsonObject[] = []
  let callPositions = new Map<string, number>()
  for (let index = 0; index < history.length;) {
    const message = history[index]
    if (!message) break
    if (message.role === 'assistant') {
      callPositions = new Map()
      if (Array.isArray(message.tool_calls)) {
        for (const [position, call] of message.tool_calls.entries()) {
          if (object(call) && typeof call.id === 'string' && !callPositions.has(call.id))
            callPositions.set(call.id, position)
        }
      }
    }
    if (message.role !== 'tool') {
      ordered.push(message)
      index++
      continue
    }
    const run: JsonObject[] = []
    while (history[index]?.role === 'tool') {
      const item = history[index]
      if (item) run.push(item)
      index++
    }
    if (
      run.every(
        item => typeof item.tool_call_id === 'string' && callPositions.has(item.tool_call_id),
      )
    )
      run.sort(
        (left, right) =>
          (callPositions.get(String(left.tool_call_id)) ?? 0) -
          (callPositions.get(String(right.tool_call_id)) ?? 0),
      )
    ordered.push(...run)
  }
  return ordered
}
function renderK3(
  body: JsonObject,
  history: readonly JsonObject[],
  schemas: readonly JsonObject[],
): Segment[] | undefined {
  const result: Segment[] = []
  if (schemas.length)
    result.push(
      ...systemK3(
        'tool-declare',
        `# Tools\nHere are the available tools, described in JSONSchema.\n\n\`\`\`json\n${writeJsonLossless(deepSort(schemas))}\n\`\`\``,
      ),
    )
  const reasoning = body.reasoning
  if (object(reasoning) && typeof reasoning.effort === 'string') {
    if (!['low', 'high', 'max'].includes(reasoning.effort)) return undefined
    result.push(
      ...systemK3(
        'thinking-effort',
        '`thinking_effort` guides on how much to think in your thinking channel (not including the response channel), supported values include `low`, `medium`, `high`, and `max`.\n' +
          `Now the system is invoked with \`thinking_effort=${reasoning.effort}\`.`,
      ),
    )
  }
  let priorCalls: readonly JsonObject[] = []
  let resultIndex = 0
  for (const message of orderedK3History(history)) {
    const role = message.role
    const content = contents(message.content)
    const renderedContent = contentSegments('k3', message.content)
    if (content === undefined || !renderedContent || typeof role !== 'string') return undefined
    if (role === 'developer') return undefined // no documented K3 developer projection
    if (role === 'tool') {
      resultIndex++
      const id = message.tool_call_id
      const matched = priorCalls.find(call => call.id === id)
      const fn = matched?.function
      if (!object(fn) || typeof fn.name !== 'string') return undefined
      result.push(
        ...open('message', [
          ['role', 'tool'],
          ['tool', fn.name],
          ['index', String(resultIndex)],
        ]),
      )
      result.push(...renderedContent, ...close('message'), control('<|end_of_msg|>'))
      continue
    }
    const attrs: [string, string][] = [['role', role]]
    if (typeof message.name === 'string' && message.name) attrs.push(['name', message.name])
    result.push(...open('message', attrs))
    if (role === 'assistant') {
      const toolCalls = calls(message)
      if (!toolCalls) return undefined
      priorCalls = toolCalls
      resultIndex = 0
      result.push(...open('think'))
      const reasoningText = message.reasoning_content ?? message.reasoning
      if (typeof reasoningText === 'string') result.push(text(reasoningText))
      else if (reasoningText !== undefined) return undefined
      result.push(...close('think'), ...open('response'), ...renderedContent, ...close('response'))
      if (toolCalls.length) {
        result.push(...open('tools'))
        for (const [index, call] of toolCalls.entries()) {
          const segments = toolCallK3(call, index + 1)
          if (!segments) return undefined
          result.push(...segments)
        }
        result.push(...close('tools'))
      }
    } else result.push(...renderedContent)
    result.push(...close('message'), control('<|end_of_msg|>'))
  }
  result.push(...open('message', [['role', 'assistant']]), ...open('think'))
  return result
}

function renderK27(
  history: readonly JsonObject[],
  schemas: readonly JsonObject[],
): Segment[] | undefined {
  const result: Segment[] = []
  if (schemas.length)
    result.push(
      control('<|im_system|>'),
      text('tool_declare'),
      control('<|im_middle|>'),
      text(jinjaJson(schemas)),
      control('<|im_end|>'),
    )
  for (const message of history) {
    const role = message.role
    const content = contents(message.content)
    const renderedContent = contentSegments('k27', message.content)
    if (content === undefined || !renderedContent || typeof role !== 'string') return undefined
    const marker =
      role === 'user' ? '<|im_user|>' : role === 'assistant' ? '<|im_assistant|>' : '<|im_system|>'
    result.push(
      control(marker),
      text(typeof message.name === 'string' && message.name ? message.name : role),
      control('<|im_middle|>'),
    )
    if (role === 'assistant') {
      const toolCalls = calls(message)
      if (!toolCalls) return undefined
      const reasoningText = message.reasoning ?? message.reasoning_content ?? ''
      if (typeof reasoningText !== 'string') return undefined
      result.push(control('<think>'), text(reasoningText), control('</think>'), ...renderedContent)
      if (toolCalls.length) {
        result.push(control('<|tool_calls_section_begin|>'))
        for (const call of toolCalls) {
          const fn = call.function
          if (typeof call.id !== 'string' || !object(fn) || typeof fn.arguments !== 'string')
            return undefined
          result.push(
            control('<|tool_call_begin|>'),
            text(call.id),
            control('<|tool_call_argument_begin|>'),
            text(fn.arguments),
            control('<|tool_call_end|>'),
          )
        }
        result.push(control('<|tool_calls_section_end|>'))
      }
    } else if (role === 'tool') {
      if (typeof message.tool_call_id !== 'string') return undefined
      result.push(text(`## Return of ${message.tool_call_id}\n`), ...renderedContent)
    } else result.push(...renderedContent)
    result.push(control('<|im_end|>'))
  }
  result.push(
    control('<|im_assistant|>'),
    text('assistant'),
    control('<|im_middle|>'),
    control('<think>'),
  )
  return result
}

/** @internal Pinned prompt projection, exposed only from this package-private module. */
export function renderMoonshotPromptSegments(
  route: Route,
  body: JsonObject,
): readonly Segment[] | undefined {
  if (Object.keys(body).some(key => !accountedBodyFields.has(key))) return undefined
  if (
    route === 'k3' &&
    body.reasoning !== undefined &&
    (!object(body.reasoning) || typeof body.reasoning.effort !== 'string')
  )
    return undefined
  if (route === 'k27' && body.reasoning !== undefined) return undefined
  const history = messages(body)
  const schemas = tools(body)
  if (!history || !schemas) return undefined
  return route === 'k3' ? renderK3(body, history, schemas) : renderK27(history, schemas)
}

/**
 * Meter-only copy of the actual body. Moonshot accepts both parallel strings beside the
 * shared visible detail when each is the identical text; the detail is then placed in the
 * template's reasoning slot exactly once. The OpenRouter conversion of details for this
 * route is unknown, so the result remains an estimate.
 */
export function projectMoonshotMeterBody(body: JsonObject): JsonObject | undefined {
  return projectVisibleReasoningBody(body, ['reasoning', 'reasoning_content'])
}

function meter(
  route: Route,
  definition: ModelDefinition,
  provider: string,
  source: string,
): InputMeter {
  const tokenizer = moonshotTokenizer(route)
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision: route === 'k3' ? 'moonshot-k3-xtml-image-5' : 'moonshot-k27-jinja-image-4',
    // Vocabulary and image processor are unchanged; only the projected domain grew.
    tokenizerRevision:
      route === 'k3'
        ? 'tokenizer-basis/moonshot-k3-xtml-image-4'
        : 'tokenizer-basis/moonshot-k27-jinja-image-3',
    evidence: `moonshotai/${source}; tiktoken.model sha256:b6c497a7469b33ced9c38afb1ad6e47f03f5e5dc05f15930799210ec050c5103; image processor/config ${route === 'k3' ? 'd122b30b/4be33360' : '498e2075/bd9a1f5d'}; visible reasoning.text details projected into the template reasoning slot, OpenRouter details conversion unknown, no holdout`,
    measureFull({
      body,
      serialized,
    }: Readonly<{ body: JsonObject; serialized: string }>): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return unavailable
      // Rendering and image counting read the same meter-only copy.
      const projected = projectMoonshotMeterBody(body)
      if (!projected) return unavailable
      const rendered = renderMoonshotPromptSegments(route, projected)
      if (!rendered) return unavailable
      const history = messages(projected)
      if (!history) return unavailable
      const patches = mediaTokens(route, history)
      if (patches === undefined) return unavailable
      // Only public prompt-template segments enter the raw estimate. OpenRouter
      // conversion uncertainty is represented by estimated + caller tokenMargin.
      return { kind: 'estimated', tokens: countSegments(tokenizer, rendered) + patches }
    },
  })
  return guardInputMeter(raw)
}

/** The two pinned routes deliberately share a vocabulary, not a prompt template. */
export function createMoonshotInputMeter(definition: ModelDefinition): InputMeter {
  const current = moonshotDefinitions.find(value => value.modelId === definition.modelId)
  if (
    !current ||
    definition.revision !== current.revision ||
    definition.implementation.name !== current.implementation.name ||
    definition.implementation.revision !== current.implementation.revision
  )
    throw new TypeError('unsupported Moonshot input-meter binding')
  if (
    definition.modelId === 'moonshotai/kimi-k3' &&
    Object.hasOwn(definition.routes, 'moonshotai/mxfp4')
  )
    return meter(
      'k3',
      definition,
      'moonshotai/mxfp4',
      'Kimi-K3@f831ab66814297da540d832a5235f8e904f29d06',
    )
  if (
    definition.modelId === 'moonshotai/kimi-k2.7-code' &&
    Object.hasOwn(definition.routes, 'moonshotai/int4')
  )
    return meter(
      'k27',
      definition,
      'moonshotai/int4',
      'Kimi-K2.7-Code@74797c9c62378b951a1f6fcf5c4631024e9b8bef',
    )
  throw new TypeError('unsupported Moonshot input-meter binding')
}
