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
// Projection adapted from DeepSeek-V4.1-Flash encoding/encoding.py at
// dba1be0a40aa45a94ad051997016db3960a90277 (MIT; tokenizers/deepseek-v41-flash/LICENSE).
// This is an estimate of the chosen OpenRouter/DeepInfra route, not a claim that
// its private prompt construction is byte-identical to the public reference.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import { imageSize } from 'image-size'
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
const SYSTEM = '<｜System｜>'
const IMAGE = '<｜deepseek_image｜>'
const THINK = '<think>'
const END_THINK = '</think>'
const DSML = '｜DSML｜'
const VISION_PATCH_SIZE = 14
const VISION_DOWNSAMPLE_RATIO = 3
const VISION_MIN_PIXELS = 295936
const VISION_MAX_TOKENS = 1024

type TextBlock = { readonly type: 'text'; readonly text: string }
type ToolResultBlock = {
  readonly type: 'tool_result'
  readonly content: string
  readonly id: string
}
type ImageBlock = { readonly type: 'image'; readonly url: string }
type MergedBlock = TextBlock | ToolResultBlock | ImageBlock
type PromptMessage = {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly reasoning: string
  readonly toolCalls: readonly JsonObject[]
  readonly blocks: readonly MergedBlock[]
}

function contentText(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return value.includes(IMAGE) ? undefined : value
  if (!Array.isArray(value)) return undefined
  const text: string[] = []
  for (const part of value) {
    if (
      !object(part) ||
      part.type !== 'text' ||
      typeof part.text !== 'string' ||
      part.text.includes(IMAGE)
    )
      return undefined
    text.push(part.text)
  }
  return text.join('\n\n')
}

function userBlocks(value: JsonValue | undefined): MergedBlock[] | undefined {
  if (typeof value === 'string')
    return value.includes(IMAGE) ? undefined : [{ type: 'text', text: value }]
  if (!Array.isArray(value)) return undefined
  const blocks: MergedBlock[] = []
  for (const part of value) {
    if (!object(part)) return undefined
    if (part.type === 'text' && typeof part.text === 'string') {
      if (part.text.includes(IMAGE)) return undefined
      blocks.push({ type: 'text', text: part.text })
    } else if (
      part.type === 'image_url' &&
      object(part.image_url) &&
      typeof part.image_url.url === 'string'
    ) {
      blocks.push({ type: 'image', url: part.image_url.url })
    } else return undefined
  }
  return blocks
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
      `<${DSML} parameter name="${name}" string="${isString}">${rendered}</${DSML} parameter>`,
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

You have access to a set of tools to help answer the user's question. You can invoke tools by writing a "<${DSML} calls>" block like the following:

<${DSML} calls>
<${DSML} invoke name="$TOOL_NAME">
<${DSML} parameter name="$PARAMETER_NAME" string="true|false">$PARAMETER_VALUE</${DSML} parameter>
...
</${DSML} invoke>
<${DSML} invoke name="$TOOL_NAME2">
...
</${DSML} invoke>
</${DSML} calls>

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
  return reorderToolResults(merged)
}

function messageContent(
  raw: JsonObject,
): { content: string | undefined; blocks: readonly MergedBlock[] | undefined } | undefined {
  const content =
    raw.role === 'assistant' && (raw.content === null || raw.content === undefined)
      ? ''
      : contentText(raw.content)
  const blocks = raw.role === 'user' ? userBlocks(raw.content) : undefined
  if (raw.role === 'user' && !blocks) return undefined
  if (raw.role !== 'user' && content === undefined) return undefined
  return { content, blocks }
}

function mergeMessage(raw: JsonObject, merged: PromptMessage[]): boolean {
  const projected = messageContent(raw)
  if (!projected) return false
  const { content, blocks } = projected
  if (raw.role === 'tool') {
    return mergeToolResult(raw, content, merged)
  }
  if (raw.role !== 'system' && raw.role !== 'user' && raw.role !== 'assistant') return false
  if (raw.role === 'user') {
    if (!blocks) return false
    mergeUserBlocks(blocks, merged)
    return true
  }
  const toolCalls = messageToolCalls(raw)
  if (!toolCalls) return false
  merged.push({
    role: raw.role,
    content: content ?? '',
    reasoning:
      typeof raw.reasoning_content === 'string'
        ? raw.reasoning_content
        : typeof raw.reasoning === 'string'
          ? raw.reasoning
          : '',
    toolCalls,
    blocks: [],
  })
  return true
}

function mergeToolResult(
  raw: JsonObject,
  content: string | undefined,
  merged: PromptMessage[],
): boolean {
  if (typeof raw.tool_call_id !== 'string') return false
  const block: ToolResultBlock = {
    type: 'tool_result',
    content: content ?? '',
    id: raw.tool_call_id,
  }
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

function mergeUserBlocks(blocks: readonly MergedBlock[], merged: PromptMessage[]): void {
  const previous = merged.at(-1)
  if (previous?.role === 'user') {
    merged[merged.length - 1] = { ...previous, blocks: [...previous.blocks, ...blocks] }
    return
  }
  merged.push({ role: 'user', content: '', reasoning: '', toolCalls: [], blocks })
}

function reorderToolResults(merged: PromptMessage[]): PromptMessage[] | undefined {
  let order = new Map<string, number>()
  for (const [index, message] of merged.entries()) {
    if (message.role === 'assistant' && message.toolCalls.length) {
      order = new Map(
        message.toolCalls.map((call, callIndex) => [String(call.id ?? ''), callIndex]),
      )
    } else if (message.role === 'user' && order.size) {
      const toolResults = message.blocks.filter(
        (block): block is ToolResultBlock => block.type === 'tool_result',
      )
      const sorted = [...toolResults].sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      )
      let next = 0
      const reordered: MergedBlock[] = []
      for (const block of message.blocks) {
        if (block.type !== 'tool_result') {
          reordered.push(block)
          continue
        }
        const result = sorted[next++]
        if (!result) return undefined
        reordered.push(result)
      }
      merged[index] = { ...message, blocks: reordered }
    }
  }
  return merged
}

/** The official V4.1 prompt projection for the OpenAI-compatible subset we send. */
export function renderDeepSeekV41Prompt(
  body: JsonObject,
  thinkingMode: 'chat' | 'thinking',
  effort: 'low' | 'high' | 'max' = 'high',
): string | undefined {
  const messages = mergeMessages(body.messages)
  if (!messages) return undefined
  const tools = promptTools(body)
  if (!tools) return undefined
  let prompt = BOS
  if (tools.length && messages[0]?.role !== 'system') {
    // The official encoder attaches OpenAI-format tools to an instruction message.
    messages.unshift({ role: 'system', content: '', reasoning: '', toolCalls: [], blocks: [] })
  }
  const lastUser = messages.findLastIndex(
    (message, index) => message.role === 'user' || (index > 0 && message.role === 'system'),
  )
  for (const [index, message] of messages.entries()) {
    prompt += instructionPrefix(message, index, thinkingMode, effort)
    const rendered = renderMessage(message, index, lastUser, tools, thinkingMode)
    if (rendered === undefined) return undefined
    prompt += rendered
    prompt += assistantPrefix(message, messages[index + 1], index, lastUser, tools, thinkingMode)
  }
  return prompt
}

function instructionPrefix(
  message: PromptMessage,
  index: number,
  thinkingMode: 'chat' | 'thinking',
  effort: 'low' | 'high' | 'max',
): string {
  let prompt = ''
  if (index === 0 && (message.role === 'system' || thinkingMode === 'thinking')) prompt += SYSTEM
  if (index === 0 && thinkingMode === 'thinking')
    prompt += `Reasoning Effort: ${effort === 'low' ? 50 : effort === 'max' ? 100 : 75} (range 1-100, the higher the value, the more thorough the reasoning)\n\n`
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
    if (index > 0) prompt += SYSTEM
    prompt += message.content
    if (index === 0 && tools.length) prompt += `\n\n${renderTools(tools)}`
  } else if (message.role === 'user') {
    prompt += USER
    prompt += message.blocks
      .map(block =>
        block.type === 'text'
          ? block.text
          : block.type === 'image'
            ? IMAGE
            : `<tool_result>${block.content}</tool_result>`,
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
  prompt += EOS
  return prompt
}

function renderCalls(toolCalls: readonly JsonObject[]): string | undefined {
  const calls: string[] = []
  for (const call of toolCalls) {
    const fn = call.function
    if (!object(fn) || typeof fn.name !== 'string' || typeof fn.arguments !== 'string')
      return undefined
    const args = toolArguments(fn.arguments)
    if (args === undefined) return undefined
    calls.push(`<${DSML} invoke name="${fn.name}">\n${args}\n</${DSML} invoke>`)
  }
  return `\n\n<${DSML} calls>\n${calls.join('\n')}\n</${DSML} calls>`
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
    (message.role === 'user' || (message.role === 'system' && index > 0)) &&
    (!next || next.role === 'assistant')
  )
    return (
      ASSISTANT +
      (thinkingMode === 'thinking' && (!dropThinking || index >= lastUser) ? THINK : END_THINK)
    )
  return ''
}

const TOKENIZER_SHA256 = 'c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b'
const CONFIG_SHA256 = '6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547'
let sharedTokenizer: Tokenizer | undefined

function pinnedFile(name: string, sha256: string): JsonObject {
  const bytes = readFileSync(
    new URL(`../../tokenizers/deepseek-v41-flash/${name}`, import.meta.url),
  )
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new TypeError(`DeepSeek V4.1 Flash ${name} failed pinned hash`)
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!object(value)) throw new TypeError(`DeepSeek V4.1 Flash ${name} is not an object`)
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

const inlineImage =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u

function imageType(mime: string): string | undefined {
  if (mime === 'image/jpeg') return 'jpg'
  return mime.startsWith('image/') ? mime.slice(6) : undefined
}

/** Pinned Flash image_processor.py grid projection, before private route transformations. */
export function referenceImageTokens(width: number, height: number): number | undefined {
  if (!validImageDimensions(width, height)) return undefined
  if (width * height < VISION_MIN_PIXELS) {
    const ratio = Math.sqrt(VISION_MIN_PIXELS / (width * height))
    width = Math.trunc(width * ratio)
    height = Math.trunc(height * ratio)
  }
  return imageGridTokens(width, height)
}

function validImageDimensions(width: number, height: number): boolean {
  return !(
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 65535 ||
    height > 65535
  )
}

function imageGridTokens(width: number, height: number): number | undefined {
  let bestWidth = Math.ceil(width / VISION_PATCH_SIZE) * VISION_PATCH_SIZE
  let bestHeight = Math.ceil(height / VISION_PATCH_SIZE) * VISION_PATCH_SIZE
  const grid = () => {
    const rows = Math.ceil(bestHeight / VISION_PATCH_SIZE / VISION_DOWNSAMPLE_RATIO)
    const columns = Math.ceil(bestWidth / VISION_PATCH_SIZE / VISION_DOWNSAMPLE_RATIO)
    return rows * (columns + 1) + 2
  }
  if (grid() > VISION_MAX_TOKENS) {
    const aspect = height / width
    const maxWidth = Math.sqrt((VISION_MAX_TOKENS - 2) / aspect + 0.25) - 0.5
    const maxHeight = maxWidth * aspect
    const cell = VISION_PATCH_SIZE * VISION_DOWNSAMPLE_RATIO
    if (maxWidth < 1) {
      bestHeight = Math.floor((VISION_MAX_TOKENS - 2) / 2) * cell
      bestWidth = cell
    } else if (maxHeight < 1) {
      bestHeight = cell
      bestWidth = (VISION_MAX_TOKENS - 3) * cell
    } else {
      const ratio = Math.min(
        (Math.floor(maxWidth) * cell) / width,
        (Math.floor(maxHeight) * cell) / height,
      )
      bestHeight = Math.floor((height * ratio) / VISION_PATCH_SIZE) * VISION_PATCH_SIZE
      bestWidth = Math.floor((width * ratio) / VISION_PATCH_SIZE) * VISION_PATCH_SIZE
    }
  }
  const tokens = grid()
  return tokens <= VISION_MAX_TOKENS && tokens >= 4 ? tokens : undefined
}

function inlineImageTokens(body: JsonObject): number | undefined {
  if (!Array.isArray(body.messages)) return undefined
  let tokens = 0
  for (const message of body.messages) {
    if (!object(message) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!object(part) || part.type !== 'image_url') continue
      const span = inlineImageSpan(part)
      if (span === undefined) return undefined
      // The encoded prompt already contains one placeholder token per image.
      tokens += span - 1
    }
  }
  return tokens
}

function inlineImageSpan(part: JsonObject): number | undefined {
  const image = part.image_url
  if (
    Object.keys(part).some(key => key !== 'type' && key !== 'image_url') ||
    !object(image) ||
    Object.keys(image).some(key => key !== 'url') ||
    typeof image.url !== 'string'
  )
    return undefined
  const match = inlineImage.exec(image.url)
  if (!match?.[1] || !match[2]) return undefined
  const decoded = Buffer.from(match[2], 'base64')
  if (!decoded.length || decoded.toString('base64') !== match[2]) return undefined
  try {
    const dimensions = imageSize(decoded)
    if (dimensions.type !== imageType(match[1])) return undefined
    return referenceImageTokens(dimensions.width, dimensions.height)
  } catch {
    return undefined
  }
}

const supplemental = createDeepSeekSupplemental(['type', 'text', 'image_url'])

/** One pinned Flash model/provider route; Pro has a distinct encoder and binding. */
export function createDeepSeekV41FlashInputMeter(definition: ModelDefinition): InputMeter {
  if (
    definition.modelId !== 'deepseek/deepseek-v4.1-flash' ||
    definition.revision !== '5' ||
    definition.implementation.name !== 'pi-ai:deepseek' ||
    definition.implementation.revision !== 'mp4-19' ||
    !Object.hasOwn(definition.routes, 'deepinfra/fp8')
  )
    throw new TypeError('unsupported DeepSeek V4.1 Flash definition')
  const encoder = tokenizer()
  const measureBoundary = (input: MarginalMeterInput) =>
    measureDeepSeekBoundary(
      input,
      text => encoder.encode(text, { add_special_tokens: false }).ids.length,
      supplemental,
      inlineImageTokens,
    )
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'deepinfra/fp8',
    algorithmRevision: 'deepseek-v41-flash-reference-5',
    tokenizerRevision: 'deepseek-v41-flash-dba1be0a40aa45a94ad051997016db3960a90277',
    replayRevision: DEEPSEEK_BOUNDARY_REVISION,
    transformRevision: 'deepseek-flash-reference-projection/2',
    measureReplay: measureBoundary,
    measureNew: measureBoundary,
    evidence:
      'DeepSeek-V4.1-Flash dba1be0a40aa45a94ad051997016db3960a90277 encoding/encoding.py + tokenizer.json c90dfa01 + inference/image_processor.py SHA256 482759e3bcc4e9bb5ee582b244cc563f5d0e163d8b48dda91ebb7106e62f9272 + inference/config.json SHA256 2e84f45cf1dac8c7fcbb200e96667d4b913275690668ed496f24c7747207a809 (patch=14, downsample=3, min_pixels=295936, max_tokens=1024), MIT; OpenRouter/DeepInfra private projection remains estimated',
    measureFull({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
      const projected = projectDeepSeekMeterBody(body)
      if (!projected) return { kind: 'unavailable' }
      const imageTokens = inlineImageTokens(body)
      if (imageTokens === undefined) return { kind: 'unavailable' }
      if (
        body.reasoning !== undefined &&
        (!object(body.reasoning) || body.reasoning.effort !== 'low')
      )
        return { kind: 'unavailable' }
      const mode = object(body.reasoning) && body.reasoning.effort === 'low' ? 'thinking' : 'chat'
      const prompt = renderDeepSeekV41Prompt(projected, mode, 'low')
      const extra = supplemental(projected)
      if (prompt === undefined || extra === undefined) return { kind: 'unavailable' }
      try {
        const mainTokens = encoder.encode(prompt, { add_special_tokens: false }).ids.length
        const extraTokens = encoder.encode(writeJsonLossless(extra), {
          add_special_tokens: false,
        }).ids.length
        return {
          kind: 'estimated',
          tokens: mainTokens + extraTokens + imageTokens,
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return guardInputMeter(raw)
}
