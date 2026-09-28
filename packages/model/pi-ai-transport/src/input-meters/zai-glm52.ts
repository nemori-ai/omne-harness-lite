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
    if (
      !object(fn) ||
      !exactKeys(fn, ['name', 'description', 'parameters']) ||
      typeof fn.name !== 'string' ||
      typeof fn.description !== 'string' ||
      !object(fn.parameters)
    )
      return undefined
    schemas.push(pythonJson(fn))
  }
  return schemas.length
    ? toolInstruction + '\n' + schemas.join('\n\n') + '\n\n' + toolInstructionEnd
    : ''
}

export function toolCalls(value: JsonValue | undefined): string | undefined {
  if (value === undefined) return ''
  if (!Array.isArray(value)) return undefined
  let rendered = ''
  for (const raw of value) {
    if (!object(raw) || !exactKeys(raw, ['id', 'type', 'function'])) return undefined
    if (typeof raw.id !== 'string' || raw.type !== 'function' || !object(raw.function))
      return undefined
    const fn = raw.function
    if (!exactKeys(fn, ['name', 'arguments']) || typeof fn.name !== 'string') return undefined
    if (typeof fn.arguments !== 'string') return undefined
    const decoded = readJsonStrict(fn.arguments)
    if (!('ok' in decoded) || !object(decoded.ok)) return undefined
    if (!rendered) rendered = '\n'
    rendered += `<tool_call>${fn.name}`
    for (const [key, item] of Object.entries(decoded.ok))
      rendered += `<arg_key>${key}</arg_key><arg_value>${typeof item === 'string' ? item : pythonJson(item)}</arg_value>`
    rendered += '</tool_call>'
  }
  return rendered
}

/** The public GLM-5.2 text/tool template's supported OpenAI-compatible subset. */
export function renderGlm52Prompt(body: JsonObject): string | undefined {
  if (!Array.isArray(body.messages)) return undefined
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
    if (!object(raw) || typeof raw.role !== 'string') return undefined
    if (raw.role === 'system' || raw.role === 'user') {
      if (!exactKeys(raw, ['role', 'content'])) return undefined
      const content = visibleText(raw.content)
      if (content === undefined) return undefined
      rendered += `${raw.role === 'system' ? '<|system|>' : '<|user|>'}${content}`
    } else if (raw.role === 'assistant') {
      if (!exactKeys(raw, ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_details']))
        return undefined
      // The final OpenRouter wire sends reasoning/reasoning_details, whereas
      // the published template consumes reasoning_content. Their mapping is
      // not proven for this route, so retaining either requires another meter.
      if (raw.reasoning !== undefined || raw.reasoning_details !== undefined) return undefined
      const content = visibleText(raw.content)
      if (content === undefined || content.includes('</think>')) return undefined
      const thinking = '<think></think>'
      const calls = toolCalls(raw.tool_calls)
      if (calls === undefined) return undefined
      rendered += `<|assistant|>${thinking}${content.trim()}${calls}${calls ? '\n' : ''}`
    } else if (raw.role === 'tool') {
      if (
        !exactKeys(raw, ['role', 'tool_call_id', 'content']) ||
        typeof raw.tool_call_id !== 'string'
      )
        return undefined
      const content = visibleText(raw.content)
      if (content === undefined) return undefined
      const previous = body.messages[index - 1]
      if (!object(previous) || previous.role !== 'tool') rendered += '<|observation|>'
      rendered += `<tool_response>${content}</tool_response>`
    } else return undefined
  }
  return rendered + '<|assistant|><think>'
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

/** One pinned GLM-5.2 model/provider binding; OpenRouter prompt conversion remains estimated. */
export function createGlm52InputMeter(definition: ModelDefinition): InputMeter {
  if (
    definition.modelId !== 'z-ai/glm-5.2' ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:zai' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, 'z-ai/fp8')
  )
    throw new TypeError('unsupported GLM-5.2 input-meter binding')
  const encoder = glm5Tokenizer()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'z-ai/fp8',
    algorithmRevision: 'glm-5.2-public-template-1',
    evidence:
      'zai-org/GLM-5.2 cf457fa734ab149ffef225f80893eb38c6ff5cdc chat_template.jinja + tokenizer.json 19e77364 (MIT); OpenRouter/Z.AI fp8 private conversion is estimated',
    measure({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderGlm52Prompt(body)
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
  }
  return Object.freeze(meter)
}
