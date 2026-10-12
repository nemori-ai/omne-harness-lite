import { messageToolCalls, promptTools } from './deepseek-prompt.ts'
import { defineInputMeter } from '../input-meter.ts'
import {
  measureDeepSeekBoundary,
  createDeepSeekSupplemental,
  deepSeekPythonJson,
  projectDeepSeekMeterBody,
  DEEPSEEK_BOUNDARY_REVISION,
} from './deepseek-boundary.ts'
import { guardInputMeter } from './shared.ts'
// Projection adapted from DeepSeek-V4-Pro encoding/encoding_dsv4.py at
// b5968e9190ef611bbf34a7229255be88a0e937c1 (MIT; resources/tokenizers/deepseek-v4/LICENSE).
// This is an estimate of the chosen OpenRouter/DeepInfra route, not a claim that
// its private prompt construction is byte-identical to the public reference.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type {
  InputMeter,
  MarginalMeterInput,
  TokenMeasurement,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'

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
    const rendered = isString ? item : deepSeekPythonJson(item)
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
      return object(fn) ? deepSeekPythonJson(fn) : ''
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
    if (!mergeMessage(raw, merged)) return undefined
  }
  return merged
}

function messageContent(raw: JsonObject): string | undefined {
  return raw.role === 'assistant' && (raw.content === null || raw.content === undefined)
    ? ''
    : contentText(raw.content)
}

function mergeMessage(raw: JsonObject, merged: PromptMessage[]): boolean {
  const content = messageContent(raw)
  if (content === undefined) return false
  if (raw.role === 'tool') {
    return mergeToolResult(raw, content, merged)
  }
  if (
    raw.role !== 'system' &&
    raw.role !== 'developer' &&
    raw.role !== 'user' &&
    raw.role !== 'assistant'
  )
    return false
  if (raw.role === 'user') {
    mergeUserContent(content, merged)
    return true
  }
  const toolCalls = messageToolCalls(raw)
  if (!toolCalls) return false
  merged.push({ role: raw.role, content, reasoning: messageReasoning(raw), toolCalls, blocks: [] })
  return true
}

function mergeToolResult(raw: JsonObject, content: string, merged: PromptMessage[]): boolean {
  if (typeof raw.tool_call_id !== 'string') return false
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
  return true
}

function mergeUserContent(content: string, merged: PromptMessage[]): void {
  const previous = merged.at(-1)
  const block: TextBlock = { type: 'text', text: content }
  if (previous?.role === 'user') {
    merged[merged.length - 1] = { ...previous, blocks: [...previous.blocks, block] }
    return
  }
  merged.push({ role: 'user', content, reasoning: '', toolCalls: [], blocks: [block] })
}

function messageReasoning(raw: JsonObject): string {
  return typeof raw.reasoning_content === 'string'
    ? raw.reasoning_content
    : typeof raw.reasoning === 'string'
      ? raw.reasoning
      : ''
}

/** The official V4 text/tool prompt projection for the OpenAI-compatible subset we send. */
export function renderDeepSeekV4Prompt(
  body: JsonObject,
  thinkingMode: 'chat' | 'thinking',
): string | undefined {
  const messages = mergeMessages(body.messages)
  if (!messages) return undefined
  const tools = promptTools(body)
  if (!tools) return undefined
  let prompt = BOS
  if (tools.length && messages[0]?.role !== 'system' && messages[0]?.role !== 'developer') {
    // The official encoder attaches OpenAI-format tools to an instruction message.
    messages.unshift({ role: 'system', content: '', reasoning: '', toolCalls: [], blocks: [] })
  }
  const lastUser = messages.findLastIndex(
    message => message.role === 'user' || message.role === 'developer',
  )
  for (const [index, message] of messages.entries()) {
    const rendered = renderMessage(message, index, lastUser, tools, thinkingMode)
    if (rendered === undefined) return undefined
    prompt += rendered
    prompt += assistantPrefix(message, messages[index + 1], index, lastUser, tools, thinkingMode)
  }
  return prompt
}

function renderMessage(
  message: PromptMessage,
  index: number,
  lastUser: number,
  tools: readonly JsonObject[],
  thinkingMode: 'chat' | 'thinking',
): string | undefined {
  let prompt = ''
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
    return renderAssistant(message, index, lastUser, tools, thinkingMode)
  }
  return prompt
}

function renderAssistant(
  message: PromptMessage,
  index: number,
  lastUser: number,
  tools: readonly JsonObject[],
  thinkingMode: 'chat' | 'thinking',
): string | undefined {
  let prompt = ''
  const dropThinking = tools.length === 0
  if (thinkingMode === 'thinking' && (!dropThinking || index > lastUser))
    prompt += message.reasoning + END_THINK
  prompt += message.content
  if (message.toolCalls.length) {
    const calls = renderCalls(message.toolCalls)
    if (calls === undefined) return undefined
    prompt += calls
  }
  return prompt + EOS
}

function renderCalls(toolCalls: readonly JsonObject[]): string | undefined {
  const calls: string[] = []
  for (const call of toolCalls) {
    const fn = call.function
    if (!object(fn) || typeof fn.name !== 'string' || typeof fn.arguments !== 'string')
      return undefined
    const args = toolArguments(fn.arguments)
    if (args === undefined) return undefined
    calls.push(`<${DSML}invoke name="${fn.name}">\n${args}\n</${DSML}invoke>`)
  }
  return `\n\n<${DSML}tool_calls>\n${calls.join('\n')}\n</${DSML}tool_calls>`
}

function assistantPrefix(
  message: PromptMessage,
  next: PromptMessage | undefined,
  index: number,
  lastUser: number,
  tools: readonly JsonObject[],
  thinkingMode: 'chat' | 'thinking',
): string {
  const dropThinking = tools.length === 0
  if (
    (message.role === 'user' || message.role === 'developer') &&
    (!next || next.role === 'assistant')
  )
    return (
      ASSISTANT +
      (thinkingMode === 'thinking' && (!dropThinking || index >= lastUser) ? THINK : END_THINK)
    )
  return ''
}

const TOKENIZER_SHA256 = '8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf'
const CONFIG_SHA256 = '6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547'
let sharedTokenizer: Tokenizer | undefined

function pinnedFile(name: string, sha256: string): JsonObject {
  const bytes = readFileSync(
    new URL(`../../resources/tokenizers/deepseek-v4/${name}`, import.meta.url),
  )
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

const supplemental = createDeepSeekSupplemental(['type', 'text'])

/** One pinned model/provider route; other V4 variants require their own tokenizer evidence. */
export function createDeepSeekV4ProInputMeter(definition: ModelDefinition): InputMeter {
  if (
    definition.modelId !== 'deepseek/deepseek-v4-pro-0813' ||
    definition.revision !== '6' ||
    definition.implementation.name !== 'pi-ai:deepseek' ||
    definition.implementation.revision !== 'mp4-19' ||
    !Object.hasOwn(definition.routes, 'deepinfra/fp8')
  )
    throw new TypeError('unsupported DeepSeek V4 Pro definition')
  const encoder = tokenizer()
  const measureBoundary = (input: MarginalMeterInput) =>
    measureDeepSeekBoundary(
      input,
      text => encoder.encode(text, { add_special_tokens: false }).ids.length,
      supplemental,
    )
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'deepinfra/fp8',
    algorithmRevision: 'deepseek-v4-pro-reference-4',
    tokenizerRevision: 'deepseek-v4-pro-b5968e9190ef611bbf34a7229255be88a0e937c1',
    replayRevision: DEEPSEEK_BOUNDARY_REVISION,
    transformRevision: 'deepseek-pro-reference-projection/2',
    measureReplay: measureBoundary,
    measureNew: measureBoundary,
    evidence:
      'DeepSeek-V4-Pro b5968e9190ef611bbf34a7229255be88a0e937c1 encoding_dsv4.py + tokenizer.json 8f9f37ca; OpenRouter/DeepInfra private projection remains estimated',
    measureFull({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
      const projected = projectDeepSeekMeterBody(body)
      if (!projected) return { kind: 'unavailable' }
      const mode = object(body.reasoning) && body.reasoning.effort === 'low' ? 'thinking' : 'chat'
      const prompt = renderDeepSeekV4Prompt(projected, mode)
      const extra = supplemental(projected)
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
  return guardInputMeter(raw)
}
