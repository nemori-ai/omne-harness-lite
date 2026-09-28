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
import { countSegments, moonshotTokenizer } from './moonshot-tokenizer.ts'

type Segment = { readonly text: string; readonly control: boolean }
type Route = 'k3' | 'k27'
const unavailable = { kind: 'unavailable' } as const
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

function k3ContentSegments(value: JsonValue | undefined): Segment[] | undefined {
  if (typeof value === 'string') return [text(value)]
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) return undefined
  const segments: Segment[] = []
  for (const part of value) {
    if (!object(part) || part.type !== 'text' || typeof part.text !== 'string') return undefined
    segments.push(text(part.text))
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
    // The public templates do not explain opaque provider reasoning details.
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
  for (const message of history) {
    const role = message.role
    const content = contents(message.content)
    const contentSegments = k3ContentSegments(message.content)
    if (content === undefined || !contentSegments || typeof role !== 'string') return undefined
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
      result.push(...contentSegments, ...close('message'), control('<|end_of_msg|>'))
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
      result.push(...close('think'), ...open('response'), ...contentSegments, ...close('response'))
      if (toolCalls.length) {
        result.push(...open('tools'))
        for (const [index, call] of toolCalls.entries()) {
          const segments = toolCallK3(call, index + 1)
          if (!segments) return undefined
          result.push(...segments)
        }
        result.push(...close('tools'))
      }
    } else result.push(...contentSegments)
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
    if (content === undefined || typeof role !== 'string') return undefined
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
      result.push(control('<think>'), text(reasoningText), control('</think>'), text(content))
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
      result.push(text(`## Return of ${message.tool_call_id}\n${content}`))
    } else result.push(text(content))
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

function meter(
  route: Route,
  definition: ModelDefinition,
  provider: string,
  source: string,
): InputMeter {
  const tokenizer = moonshotTokenizer(route)
  return Object.freeze({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision: route === 'k3' ? 'moonshot-k3-xtml-2' : 'moonshot-k27-jinja-2',
    evidence: `moonshotai/${source}; tiktoken.model sha256:b6c497a7469b33ced9c38afb1ad6e47f03f5e5dc05f15930799210ec050c5103`,
    measure({
      body,
      serialized,
    }: Readonly<{ body: JsonObject; serialized: string }>): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return unavailable
      const rendered = renderMoonshotPromptSegments(route, body)
      if (!rendered) return unavailable
      // Only public prompt-template segments enter the raw estimate. OpenRouter
      // conversion uncertainty is represented by estimated + caller tokenMargin.
      return { kind: 'estimated', tokens: countSegments(tokenizer, rendered) }
    },
  })
}

/** The two pinned routes deliberately share a vocabulary, not a prompt template. */
export function createMoonshotInputMeter(definition: ModelDefinition): InputMeter {
  if (
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:moonshot' ||
    definition.implementation.revision !== 'mp4-1'
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
