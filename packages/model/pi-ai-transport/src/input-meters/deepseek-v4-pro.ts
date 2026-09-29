import { defineInputMeter } from '../input-meter.ts'
import { measureDeepSeekBoundary } from './deepseek-boundary.ts'
// Projection adapted from DeepSeek-V4-Pro encoding/encoding_dsv4.py at
// b5968e9190ef611bbf34a7229255be88a0e937c1 (MIT; tokenizers/deepseek-v4/LICENSE).
// This is an estimate of the chosen OpenRouter/DeepInfra route, not a claim that
// its private prompt construction is byte-identical to the public reference.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  isJsonNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import type { ModelDefinition } from '../definitions.ts'

const BOS = '<｜begin▁of▁sentence｜>'
const EOS = '<｜end▁of▁sentence｜>'
const USER = '<｜User｜>'
const ASSISTANT = '<｜Assistant｜>'
const THINK = '<think>'
const END_THINK = '</think>'
const DSML = '｜DSML｜'

type TextBlock = { readonly type: 'text'; readonly text: string }
type ToolResultBlock = {
  readonly type: 'tool_result'
  readonly content: string
  readonly id: string
}
type MergedBlock = TextBlock | ToolResultBlock
type PromptMessage = {
  readonly role: 'system' | 'developer' | 'user' | 'assistant'
  readonly content: string
  readonly reasoning: string
  readonly toolCalls: readonly JsonObject[]
  readonly blocks: readonly MergedBlock[]
}

function pythonJson(value: JsonValue): string {
  if (isJsonNumber(value)) return jsonNumberSource(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  return `{${Object.entries(value)
    .map(([name, item]) => `${JSON.stringify(name)}: ${pythonJson(item)}`)
    .join(', ')}}`
}

function contentText(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  let text = ''
  for (const part of value) {
    if (!object(part) || part.type !== 'text' || typeof part.text !== 'string') return undefined
    text += part.text
  }
  return text
}

function toolArguments(value: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!object(parsed)) return undefined
  const parameters: string[] = []
  for (const [name, item] of Object.entries(parsed)) {
    const isString = typeof item === 'string'
    const rendered = isString ? item : pythonJson(item)
    parameters.push(
      `<${DSML}parameter name="${name}" string="${isString}">${rendered}</${DSML}parameter>`,
    )
  }
  return parameters.join('\n')
}

function renderTools(tools: readonly JsonObject[]): string {
  const schemas = tools
    .map(tool => {
      const fn = tool.function
      return object(fn) ? pythonJson(fn) : ''
    })
    .join('\n')
  return `## Tools

You have access to a set of tools to help answer the user's question. You can invoke tools by writing a "<${DSML}tool_calls>" block like the following:

<${DSML}tool_calls>
<${DSML}invoke name="$TOOL_NAME">
<${DSML}parameter name="$PARAMETER_NAME" string="true|false">$PARAMETER_VALUE</${DSML}parameter>
...
</${DSML}invoke>
<${DSML}invoke name="$TOOL_NAME2">
...
</${DSML}invoke>
</${DSML}tool_calls>

String parameters should be specified as is and set \`string="true"\`. For all other types (numbers, booleans, arrays, objects), pass the value in JSON format and set \`string="false"\`.

If thinking_mode is enabled (triggered by ${THINK}), you MUST output your complete reasoning inside ${THINK}...${END_THINK} BEFORE any tool calls or final response.

Otherwise, output directly after ${END_THINK} with tool calls or final response.

### Available Tool Schemas

${schemas}

You MUST strictly follow the above defined tool name and parameter schemas to invoke tool calls.
`
}

function mergeMessages(value: JsonValue | undefined): PromptMessage[] | undefined {
  if (!Array.isArray(value)) return undefined
  const merged: PromptMessage[] = []
  for (const raw of value) {
    if (!object(raw) || typeof raw.role !== 'string') return undefined
    const content =
      raw.role === 'assistant' && (raw.content === null || raw.content === undefined)
        ? ''
        : contentText(raw.content)
    if (content === undefined) return undefined
    if (raw.role === 'tool') {
      if (typeof raw.tool_call_id !== 'string') return undefined
      const block: ToolResultBlock = { type: 'tool_result', content, id: raw.tool_call_id }
      const previous = merged.at(-1)
      if (previous?.role === 'user') {
        merged[merged.length - 1] = { ...previous, blocks: [...previous.blocks, block] }
      } else {
        merged.push({
          role: 'user',
          content: '',
          reasoning: '',
          toolCalls: [],
          blocks: [block],
        })
      }
      continue
    }
    if (
      raw.role !== 'system' &&
      raw.role !== 'developer' &&
      raw.role !== 'user' &&
      raw.role !== 'assistant'
    )
      return undefined
    if (raw.role === 'user') {
      const previous = merged.at(-1)
      const block: TextBlock = { type: 'text', text: content }
      if (previous?.role === 'user') {
        merged[merged.length - 1] = { ...previous, blocks: [...previous.blocks, block] }
        continue
      }
      merged.push({ role: 'user', content, reasoning: '', toolCalls: [], blocks: [block] })
      continue
    }
    const toolCalls: JsonObject[] = []
    if (raw.tool_calls !== undefined) {
      if (!Array.isArray(raw.tool_calls)) return undefined
      for (const call of raw.tool_calls) {
        if (!object(call)) return undefined
        toolCalls.push(call)
      }
    }
    merged.push({
      role: raw.role,
      content,
      reasoning:
        typeof raw.reasoning_content === 'string'
          ? raw.reasoning_content
          : typeof raw.reasoning === 'string'
            ? raw.reasoning
            : '',
      toolCalls,
      blocks: [],
    })
  }
  return merged
}

/** The official V4 text/tool prompt projection for the OpenAI-compatible subset we send. */
export function renderDeepSeekV4Prompt(
  body: JsonObject,
  thinkingMode: 'chat' | 'thinking',
): string | undefined {
  const messages = mergeMessages(body.messages)
  if (!messages) return undefined
  let tools: readonly JsonObject[] = []
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) return undefined
    const checked: JsonObject[] = []
    for (const tool of body.tools) {
      if (!object(tool) || !object(tool.function)) return undefined
      checked.push(tool)
    }
    tools = checked
  }
  let prompt = BOS
  if (tools.length && messages[0]?.role !== 'system' && messages[0]?.role !== 'developer') {
    // The official encoder attaches OpenAI-format tools to an instruction message.
    messages.unshift({ role: 'system', content: '', reasoning: '', toolCalls: [], blocks: [] })
  }
  const lastUser = messages.findLastIndex(
    message => message.role === 'user' || message.role === 'developer',
  )
  const dropThinking = tools.length === 0
  for (const [index, message] of messages.entries()) {
    if (message.role === 'system') {
      prompt += message.content
      if (index === 0 && tools.length) prompt += `\n\n${renderTools(tools)}`
    } else if (message.role === 'developer') {
      if (!message.content) return undefined
      prompt += USER + message.content
      if (index === 0 && tools.length) prompt += `\n\n${renderTools(tools)}`
    } else if (message.role === 'user') {
      prompt += USER
      prompt += message.blocks
        .map(block =>
          block.type === 'text' ? block.text : `<tool_result>${block.content}</tool_result>`,
        )
        .join('\n\n')
    } else {
      if (thinkingMode === 'thinking' && (!dropThinking || index > lastUser))
        prompt += message.reasoning + END_THINK
      prompt += message.content
      if (message.toolCalls.length) {
        const calls: string[] = []
        for (const call of message.toolCalls) {
          const fn = call.function
          if (!object(fn) || typeof fn.name !== 'string' || typeof fn.arguments !== 'string')
            return undefined
          const args = toolArguments(fn.arguments)
          if (args === undefined) return undefined
          calls.push(`<${DSML}invoke name="${fn.name}">\n${args}\n</${DSML}invoke>`)
        }
        prompt += `\n\n<${DSML}tool_calls>\n${calls.join('\n')}\n</${DSML}tool_calls>`
      }
      prompt += EOS
    }
    const next = messages[index + 1]
    if (
      (message.role === 'user' || message.role === 'developer') &&
      (!next || next.role === 'assistant')
    )
      prompt +=
        ASSISTANT +
        (thinkingMode === 'thinking' && (!dropThinking || index >= lastUser) ? THINK : END_THINK)
  }
  return prompt
}

const TOKENIZER_SHA256 = '8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf'
const CONFIG_SHA256 = '6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547'
let sharedTokenizer: Tokenizer | undefined

function pinnedFile(name: string, sha256: string): JsonObject {
  const bytes = readFileSync(new URL(`../../tokenizers/deepseek-v4/${name}`, import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new TypeError(`DeepSeek V4 ${name} failed pinned hash`)
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!object(value)) throw new TypeError(`DeepSeek V4 ${name} is not an object`)
  return value
}

function tokenizer(): Tokenizer {
  if (sharedTokenizer) return sharedTokenizer
  const instance = new Tokenizer(
    pinnedFile('tokenizer.json', TOKENIZER_SHA256),
    pinnedFile('tokenizer_config.json', CONFIG_SHA256),
  )
  sharedTokenizer = instance
  return instance
}

function omittedContent(value: JsonValue | undefined): JsonValue | undefined {
  if (!Array.isArray(value)) return undefined
  const omitted: JsonValue[] = []
  for (const part of value) {
    if (!object(part)) return undefined
    const extra = Object.fromEntries(
      Object.entries(part).filter(([name]) => name !== 'type' && name !== 'text'),
    )
    if (Object.keys(extra).length) omitted.push(extra)
  }
  return omitted.length ? omitted : undefined
}

/** Wire fields not rendered by the public prompt reference still enter the estimate. */
function supplemental(body: JsonObject): JsonObject | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const request = Object.fromEntries(
    Object.entries(body).filter(([name]) => name !== 'messages' && name !== 'tools'),
  )
  const messages: JsonValue[] = []
  for (const message of body.messages) {
    if (!object(message)) return undefined
    const extra = Object.fromEntries(
      Object.entries(message).filter(
        ([name]) =>
          name !== 'role' &&
          name !== 'content' &&
          name !== 'reasoning' &&
          name !== 'reasoning_content' &&
          name !== 'tool_calls',
      ),
    )
    const contentExtra = omittedContent(message.content)
    if (contentExtra) extra.contentParts = contentExtra
    if (Array.isArray(message.tool_calls)) {
      const calls: JsonValue[] = []
      for (const call of message.tool_calls) {
        if (!object(call)) return undefined
        const extras = Object.fromEntries(
          Object.entries(call).filter(([name]) => name !== 'function'),
        )
        if (Object.keys(extras).length) calls.push(extras)
      }
      if (calls.length) extra.toolCallMetadata = calls
    }
    if (Object.keys(extra).length) messages.push(extra)
  }
  const tools: JsonValue[] = []
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) return undefined
    for (const tool of body.tools) {
      if (!object(tool)) return undefined
      const extra = Object.fromEntries(Object.entries(tool).filter(([name]) => name !== 'function'))
      if (Object.keys(extra).length) tools.push(extra)
    }
  }
  return {
    request,
    ...(messages.length ? { messages } : {}),
    ...(tools.length ? { tools } : {}),
  }
}

/** One pinned model/provider route; other V4 variants require their own tokenizer evidence. */
export function createDeepSeekV4ProInputMeter(definition: ModelDefinition): InputMeter {
  if (
    definition.modelId !== 'deepseek/deepseek-v4-pro-0813' ||
    definition.revision !== '3' ||
    definition.implementation.name !== 'pi-ai:deepseek' ||
    definition.implementation.revision !== 'mp4-3' ||
    !Object.hasOwn(definition.routes, 'deepinfra/fp8')
  )
    throw new TypeError('unsupported DeepSeek V4 Pro definition')
  const encoder = tokenizer()
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'deepinfra/fp8',
    algorithmRevision: 'deepseek-v4-pro-reference-2',
    tokenizerRevision: 'deepseek-v4-pro-b5968e9190ef611bbf34a7229255be88a0e937c1',
    replayRevision: 'deepseek-reference-boundary/1',
    transformRevision: 'deepseek-pro-reference-projection/1',
    measureReplay: input =>
      measureDeepSeekBoundary(
        input,
        text => encoder.encode(text, { add_special_tokens: false }).ids.length,
        supplemental,
      ),
    measureNew: input =>
      measureDeepSeekBoundary(
        input,
        text => encoder.encode(text, { add_special_tokens: false }).ids.length,
        supplemental,
      ),
    evidence:
      'DeepSeek-V4-Pro b5968e9190ef611bbf34a7229255be88a0e937c1 encoding_dsv4.py + tokenizer.json 8f9f37ca; OpenRouter/DeepInfra private projection remains estimated',
    measureFull({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
      const mode = object(body.reasoning) && body.reasoning.effort === 'low' ? 'thinking' : 'chat'
      const prompt = renderDeepSeekV4Prompt(body, mode)
      const extra = supplemental(body)
      if (prompt === undefined || extra === undefined) return { kind: 'unavailable' }
      try {
        const mainTokens = encoder.encode(prompt, { add_special_tokens: false }).ids.length
        const extraTokens = encoder.encode(writeJsonLossless(extra), {
          add_special_tokens: false,
        }).ids.length
        return { kind: 'estimated', tokens: mainTokens + extraTokens }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return Object.freeze(meter)
}
