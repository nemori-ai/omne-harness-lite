import { defineInputMeter } from '../input-meter.ts'
// Projection of zai-org/GLM-5.2 chat_template.jinja at
// cf457fa734ab149ffef225f80893eb38c6ff5cdc (MIT). This is an estimate
// for OpenRouter's Z.AI fp8 route, whose private prompt transformation is unknown.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  isJsonNumber,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import type { ZaiHistoryTreatment } from '../official-models/zai.ts'
import { guardInputMeter } from './shared.ts'
import {
  projectZaiHistory,
  zaiAssistantReasoning,
  zaiCurrentRelease,
  zaiVisibleHistoryEvidence,
} from './zai-release.ts'

const tokenizerSha256 = '19e773648cb4e65de8660ea6365e10acca112d42a854923df93db4a6f333a82d'
const configSha256 = '98b1271574f41abf89427ae2dda030d94dc9478f0edc5a8bd240db213c6fd5fc'
const prefix = '[gMASK]<sop>'
const toolInstruction = `<|system|>
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
`
const toolInstructionEnd = `
</tools>

For each function call, output the function name and arguments within the following XML format:
<tool_call>{function-name}<arg_key>{arg-key-1}</arg_key><arg_value>{arg-value-1}</arg_value><arg_key>{arg-key-2}</arg_key><arg_value>{arg-value-2}</arg_value>...</tool_call>`

function pythonJson(value: JsonValue): string {
  if (isJsonNumber(value)) return jsonNumberSource(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  return `{${Object.entries(value)
    .map(([key, item]) => `${JSON.stringify(key)}: ${pythonJson(item)}`)
    .join(', ')}}`
}

export function exactKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

export function visibleText(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  let text = ''
  for (const item of value) {
    if (!object(item) || !exactKeys(item, ['type', 'text'])) return undefined
    if (item.type !== 'text' || typeof item.text !== 'string') return undefined
    text += item.text
  }
  return text
}

export function toolSchemas(value: JsonValue | undefined): string | undefined {
  if (value === undefined) return ''
  if (!Array.isArray(value)) return undefined
  const schemas: string[] = []
  for (const raw of value) {
    if (!object(raw) || !exactKeys(raw, ['type', 'function']) || raw.type !== 'function')
      return undefined
    const fn = raw.function
    if (!schemaFunctionValid(fn)) return undefined
    schemas.push(pythonJson(fn))
  }
  return schemas.length
    ? toolInstruction + '\n' + schemas.join('\n\n') + '\n\n' + toolInstructionEnd
    : ''
}

function schemaFunctionValid(fn: JsonValue | undefined): fn is JsonObject {
  return (
    object(fn) &&
    exactKeys(fn, ['name', 'description', 'parameters']) &&
    typeof fn.name === 'string' &&
    typeof fn.description === 'string' &&
    object(fn.parameters)
  )
}

export function toolCalls(value: JsonValue | undefined): string | undefined {
  if (value === undefined) return ''
  if (!Array.isArray(value)) return undefined
  let rendered = ''
  for (const raw of value) {
    const call = decodedToolCall(raw)
    if (!call) return undefined
    const { fn, arguments: args } = call
    if (!rendered) rendered = '\n'
    rendered += `<tool_call>${fn.name}`
    for (const [key, item] of Object.entries(args))
      rendered += `<arg_key>${key}</arg_key><arg_value>${typeof item === 'string' ? item : pythonJson(item)}</arg_value>`
    rendered += '</tool_call>'
  }
  return rendered
}

function decodedToolCall(raw: JsonValue): { fn: JsonObject; arguments: JsonObject } | undefined {
  if (!object(raw) || !exactKeys(raw, ['id', 'type', 'function'])) return undefined
  if (typeof raw.id !== 'string' || raw.type !== 'function' || !object(raw.function))
    return undefined
  const fn = raw.function
  if (!exactKeys(fn, ['name', 'arguments']) || typeof fn.name !== 'string') return undefined
  if (typeof fn.arguments !== 'string') return undefined
  const decoded = readJsonStrict(fn.arguments)
  if (!('ok' in decoded) || !object(decoded.ok)) return undefined
  return { fn, arguments: decoded.ok }
}

/**
 * The public GLM-5.2 text/tool template's supported OpenAI-compatible subset. Historical
 * reasoning renders as with an explicit `clear_thinking=false` (every assistant, before or
 * after the last user), not the template default that clears it before the last user.
 */
export function renderGlm52Prompt(
  wire: JsonObject,
  history: ZaiHistoryTreatment,
): string | undefined {
  const body = projectZaiHistory(wire, history)
  if (!body || !hasMessages(body)) return undefined
  if (
    !exactKeys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ])
  )
    return undefined
  const schemas = toolSchemas(body.tools)
  if (schemas === undefined) return undefined
  const effort = body.reasoning
  if (
    effort !== undefined &&
    (!object(effort) || !exactKeys(effort, ['effort']) || effort.effort !== 'high')
  )
    return undefined
  let rendered = prefix + `<|system|>Reasoning Effort: ${effort ? 'High' : 'Max'}` + schemas
  for (const [index, raw] of body.messages.entries()) {
    const message = renderMessage(raw, index, body, history)
    if (message === undefined) return undefined
    rendered += message
  }
  return rendered + '<|assistant|><think>'
}

function hasMessages(body: JsonObject): body is JsonObject & { messages: JsonValue[] } {
  return Array.isArray(body.messages)
}

function renderMessage(
  raw: JsonValue,
  index: number,
  body: JsonObject & { messages: JsonValue[] },
  history: ZaiHistoryTreatment,
): string | undefined {
  if (!object(raw) || typeof raw.role !== 'string') return undefined
  if (raw.role === 'system' || raw.role === 'user') {
    if (!exactKeys(raw, ['role', 'content'])) return undefined
    const content = visibleText(raw.content)
    if (content === undefined) return undefined
    return `${raw.role === 'system' ? '<|system|>' : '<|user|>'}${content}`
  } else if (raw.role === 'assistant') {
    return renderAssistant(raw, history)
  } else if (raw.role === 'tool') {
    return renderToolResponse(raw, index, body)
  } else return undefined
}

function renderAssistant(raw: JsonObject, history: ZaiHistoryTreatment): string | undefined {
  if (!exactKeys(raw, ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_details']))
    return undefined
  // The final OpenRouter wire sends reasoning/reasoning_details, whereas the published
  // template consumes reasoning_content. Only a visible-history release maps the plain
  // string into that slot; nothing is ever silently discarded.
  const thought = zaiAssistantReasoning(raw, history)
  if (thought === undefined) return undefined
  const content = visibleText(raw.content)
  if (content === undefined || content.includes('</think>')) return undefined
  const thinking = `<think>${thought.reasoning ?? ''}</think>`
  const calls = toolCalls(raw.tool_calls)
  if (calls === undefined) return undefined
  return `<|assistant|>${thinking}${content.trim()}${calls}${calls ? '\n' : ''}`
}

function renderToolResponse(
  raw: JsonObject,
  index: number,
  body: JsonObject & { messages: JsonValue[] },
): string | undefined {
  if (!exactKeys(raw, ['role', 'tool_call_id', 'content']) || typeof raw.tool_call_id !== 'string')
    return undefined
  const content = visibleText(raw.content)
  if (content === undefined) return undefined
  const previous = body.messages[index - 1]
  let rendered = ''
  if (!object(previous) || previous.role !== 'tool') rendered += '<|observation|>'
  rendered += `<tool_response>${content}</tool_response>`
  return rendered
}

let sharedTokenizer: Tokenizer | undefined
function pinnedJson(name: string, sha256: string): JsonObject {
  const bytes = readFileSync(new URL(`../../tokenizers/zai-glm5/${name}`, import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new TypeError(`GLM-5.2 ${name} failed pinned hash`)
  const parsed: unknown = JSON.parse(bytes.toString('utf8'))
  if (!object(parsed)) throw new TypeError(`GLM-5.2 ${name} is not an object`)
  return parsed
}

export function glm5Tokenizer(): Tokenizer {
  sharedTokenizer ??= new Tokenizer(
    pinnedJson('tokenizer.json', tokenizerSha256),
    pinnedJson('tokenizer_config.json', configSha256),
  )
  return sharedTokenizer
}

/**
 * One pinned GLM-5.2 model/provider binding at its current exported release; OpenRouter
 * prompt conversion remains estimated. The full/φ/δ methods run the shared source guards.
 */
export function createGlm52InputMeter(definition: ModelDefinition): InputMeter {
  const current =
    definition.modelId === 'z-ai/glm-5.2' ? zaiCurrentRelease(definition, 'z-ai/fp8') : undefined
  if (!current) throw new TypeError('unsupported GLM-5.2 input-meter binding')
  const { release, history } = current
  const encoder = glm5Tokenizer()
  const evidence =
    'zai-org/GLM-5.2 cf457fa734ab149ffef225f80893eb38c6ff5cdc chat_template.jinja + tokenizer.json 19e77364 (MIT); OpenRouter/Z.AI fp8 private conversion is estimated'
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'z-ai/fp8',
    algorithmRevision: release.algorithmRevision,
    ...(release.tokenizerRevision === undefined
      ? {}
      : { tokenizerRevision: release.tokenizerRevision }),
    evidence: history === 'visible' ? `${evidence}; ${zaiVisibleHistoryEvidence}` : evidence,
    measureFull({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderGlm52Prompt(body, history)
      if (prompt === undefined) return { kind: 'unavailable' }
      try {
        return {
          kind: 'estimated',
          tokens: encoder.encode(prompt, { add_special_tokens: false }).ids.length,
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return guardInputMeter(raw)
}
