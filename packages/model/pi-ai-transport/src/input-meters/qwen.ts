// Narrow text/tool projection of the pinned Qwen3.8 public chat templates.
// OpenRouter/Alibaba's private conversion is unknown: results are estimates.
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
import type { ModelDefinition } from '../definitions.ts'
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
const tokenizerSha256 = '0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3'

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

// Jinja's default tojson sorts object keys, retains separator spaces, and
// escapes HTML-sensitive characters. The JSON number source stays lossless.
function jinjaJson(value: JsonValue): string {
  if (isJsonNumber(value)) return jsonNumberSource(value)
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/'/g, '\\u0027')
  if (Array.isArray(value)) return `[${value.map(jinjaJson).join(', ')}]`
  if (!object(value)) throw new TypeError('JSON object required')
  return `{${Object.keys(value)
    .sort()
    .map(key => `${jinjaJson(key)}: ${jinjaJson(value[key] ?? null)}`)
    .join(', ')}}`
}

function content(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (value === null) return ''
  if (!Array.isArray(value)) return undefined
  let text = ''
  for (const part of value) {
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

function messages(value: JsonValue | undefined): PromptMessage[] | undefined {
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
    const rendered = content(raw.content)
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
  if (!result.some(message => message.role === 'user')) return undefined
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
    for (const [name, value] of Object.entries(parsed.ok))
      output += `<parameter=${name}>\n${typeof value === 'string' ? value : jinjaJson(value)}\n</parameter>\n`
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
  const sequence = messages(body.messages)
  const definitions = tools(body.tools)
  if (!sequence || !definitions) return undefined
  const first = sequence[0]
  if (!first) return undefined
  let prompt = ''
  if (definitions.length) {
    prompt = `<|im_start|>system\n${xhighInstruction}\n\n${toolPrefix}`
    for (const definition of definitions) prompt += `\n${jinjaJson(definition)}`
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

/** Published-tokenizer estimate for the two exact public Alibaba leaves. */
export function createQwenInputMeter(definition: ModelDefinition): InputMeter {
  const source = sourceFor(definition.modelId)
  if (
    !source ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:qwen' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, 'alibaba')
  )
    throw new TypeError('unsupported Qwen definition')
  const encoder = tokenizer(source.directory)
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'alibaba',
    algorithmRevision: 'qwen-38-public-template-1',
    evidence: `${source.repository} ${source.commit} public chat_template.jinja and tokenizer.json sha256:${tokenizerSha256}; text/tools subset; OpenRouter/Alibaba conversion remains estimated`,
    measure({ body, serialized }): TokenMeasurement {
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
      const prompt = renderQwenPrompt(body)
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
