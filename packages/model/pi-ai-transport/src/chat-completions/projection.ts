// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (convertMessages,
// convertTools, addCacheControlToTextContent; the source file is named in provenance.json).
// Copyright (c) 2025 Mario Zechner. MIT: ../../LICENSE.pi. See provenance.json.
//
// The one projection of a request onto the gateway messages. Plan and encode both call it, so the
// meter sees the shape that encode writes. Replay follows the contract projection; every vendor
// difference comes from the record or a hook.
import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  judgeReplayDeclaration,
  projectReplay,
  type Adoption,
  type FixedModelRequest,
  type ReplayDeclaration,
  type ReplayDiagnostic,
  type ReplayTreatment,
  type ToolDeclaration,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { list, object, sorted, text } from './json.ts'
import type {
  ChatCompletionsRecord,
  ChatMessage,
  ChatMessageId,
  ProjectedPart,
  ProjectedTurn,
  ReplayPart,
  ReplayWire,
  VendorHooks,
  WireProfile,
} from './vocabulary.ts'

type WireRole = ProjectedTurn['role']

/** One part of a wire message. */
type WirePart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; url: string; detail: string }>

/** One gateway message before it is written. */
export type WireMessage = Readonly<{
  role: WireRole
  /** The log message it comes from; `null` for the system instruction. */
  message: ChatMessageId | null
  parts: readonly WirePart[]
  blocks: readonly ProjectedPart[]
  /** Only for an assistant message. */
  toolCalls: readonly JsonValue[]
  replay: ReplayWire
  /** Only for a tool message: the normalized call id. */
  toolCallId: string | null
}>

export type Projection = Readonly<{
  instruction: readonly ContentBlock[]
  messages: readonly WireMessage[]
  tools: readonly JsonValue[]
  /** `undefined`: the body has no `tool_choice`. */
  toolChoice: JsonValue | undefined
  treatments: readonly ReplayTreatment[]
  diagnostics: readonly ReplayDiagnostic[]
}>

export type ProjectionInput = Readonly<{
  record: ChatCompletionsRecord
  hooks: VendorHooks
  adapter: Adoption
  declaration: ReplayDeclaration
  system: readonly ContentBlock[]
  messages: readonly ChatMessage[]
  tools: readonly ToolDeclaration[]
  toolChoice: FixedModelRequest['toolChoice']
  replayOff: boolean
  /** The messages that this dispatch must treat as unable to continue. */
  resent: ReadonlySet<ChatMessageId>
}>

const TOOL_CALL_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * A call id the gateway accepts: kept when it matches `^[A-Za-z0-9_-]{1,64}$`, else `call_` and
 * the first 32 characters of the base64url SHA-256 of the id.
 */
export function normalizeToolCallId(id: string): string {
  return TOOL_CALL_ID.test(id)
    ? id
    : `call_${createHash('sha256').update(id).digest('base64url').slice(0, 32)}`
}

/** The replay declaration of a record with every default applied. Throws for a record defect. */
export function recordDeclaration(record: ChatCompletionsRecord): ReplayDeclaration {
  const judged = judgeReplayDeclaration(
    {
      recipient: record.route.recipient,
      model: record.route.model,
      replay: record.replay.declaration,
    },
    0,
  )
  if (!('ok' in judged))
    throw new RangeError(
      `record ${record.name} has an invalid replay declaration: ${judged.failure.reason}`,
    )
  return judged.ok
}

function unsupported(field: string, adapter: Adoption): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unsupported', field, adapter } }
}

function invalid(field: string, reason: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

/** The wire part of one content block, `null` for a block the model does not see or an empty text. */
function contentPart(
  block: ContentBlock,
  path: string,
  image: WireProfile['image'],
  adapter: Adoption,
): Outcome<WirePart | null, TransportFailure> {
  if (!block.visibility.toModel) return { ok: null }
  if ('ref' in block) return unsupported(path, adapter)
  switch (block.kind) {
    case 'text':
      return { ok: block.text.length === 0 ? null : { type: 'text', text: block.text } }
    case 'image':
      if (image === null || !image.mediaTypes.includes(block.mediaType))
        return unsupported(path, adapter)
      return {
        ok: {
          type: 'image',
          url: `data:${block.mediaType};base64,${block.inline}`,
          detail: image.detail,
        },
      }
    case 'voice':
    case 'file':
    case 'thinking':
      return unsupported(path, adapter)
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

/** The tool call id each pending call answers to, with the path of the call. */
type PendingCalls = Map<string, string>

/**
 * Projects the request for one supplier. Failures name a safe path: `/system/<i>`,
 * `/messages/<i>/blocks/<j>`, `/tools/<k>` or `toolChoice`.
 */
export function project(input: ProjectionInput): Outcome<Projection, TransportFailure> {
  const { record, hooks } = input
  const replay = projectReplay({
    messages: input.messages,
    declaration: input.declaration,
    formats: new Set(record.replay.formats.accepts),
    off: input.replayOff,
    resent: input.resent,
  })
  const treatments = new Map(replay.treatments.map(treatment => [treatment.index, treatment]))
  const messages: WireMessage[] = []

  const instruction = instructionMessage(input)
  if (!('ok' in instruction)) return instruction
  if (instruction.ok !== null) messages.push(instruction.ok)

  const pending: PendingCalls = new Map()
  /** Images of a run of tool messages; they go out in one user message after the run. */
  let toolImages: { message: ChatMessageId; parts: WirePart[]; blocks: ProjectedPart[] } | null =
    null
  const flushToolImages = (): void => {
    if (toolImages !== null && toolImages.parts.length > 0)
      messages.push(plainMessage('user', toolImages.message, toolImages.parts, toolImages.blocks))
    toolImages = null
  }

  for (const [index, message] of input.messages.entries()) {
    const path = `/messages/${index}`
    if (message.role !== 'tool') flushToolImages()
    switch (message.role) {
      case 'tool_internal':
        continue
      case 'user':
      case 'compaction':
      case 'system_reminder': {
        const role = message.role === 'system_reminder' ? record.wire.roles.reminder : 'user'
        const converted = contentMessage(message, path, role, input)
        if (!('ok' in converted)) return converted
        if (converted.ok !== null) messages.push(converted.ok)
        continue
      }
      case 'assistant': {
        const treatment = treatments.get(index)
        if (treatment === undefined) throw new Error(`the replay projection lacks message ${index}`)
        const converted = assistantMessage(message, path, treatment, pending, input)
        if (!('ok' in converted)) return converted
        if (converted.ok !== null) messages.push(converted.ok)
        continue
      }
      case 'tool': {
        const converted = toolMessage(message, path, pending, input)
        if (!('ok' in converted)) return converted
        messages.push(converted.ok.message)
        if (converted.ok.images.length > 0) {
          toolImages ??= { message: message.id, parts: [], blocks: [] }
          toolImages.parts.push(...converted.ok.images)
          toolImages.blocks.push(...converted.ok.imageBlocks)
        }
        continue
      }
      default: {
        const _exhaustive: never = message
        return _exhaustive
      }
    }
  }
  flushToolImages()
  const orphan = pending.values().next()
  if (orphan.done !== true) return invalid(orphan.value, 'orphan-tool-call')

  const tools: JsonValue[] = []
  for (const [index, tool] of input.tools.entries()) {
    const wired = toolPayload(tool, hooks)
    if (!('ok' in wired))
      return wired.failure.kind === 'invalid' || wired.failure.kind === 'unsupported'
        ? { failure: { ...wired.failure, field: `/tools/${index}/${wired.failure.field}` } }
        : wired
    tools.push(wired.ok)
  }
  const toolChoice = toolChoiceOf(input.toolChoice, input.tools)
  if (!('ok' in toolChoice)) return toolChoice

  return {
    ok: {
      instruction: input.system.filter(block => block.visibility.toModel),
      messages,
      tools,
      toolChoice: toolChoice.ok,
      treatments: replay.treatments,
      diagnostics: replay.diagnostics,
    },
  }
}

function plainMessage(
  role: WireRole,
  message: ChatMessageId | null,
  parts: readonly WirePart[],
  blocks: readonly ProjectedPart[],
): WireMessage {
  return { role, message, parts, blocks, toolCalls: [], replay: { kind: 'none' }, toolCallId: null }
}

function instructionMessage(input: ProjectionInput): Outcome<WireMessage | null, TransportFailure> {
  const parts: WirePart[] = []
  const blocks: ContentBlock[] = []
  for (const [index, block] of input.system.entries()) {
    const path = `/system/${index}`
    // The instruction carries text only.
    if (block.visibility.toModel && block.kind !== 'text') return unsupported(path, input.adapter)
    const part = contentPart(block, path, null, input.adapter)
    if (!('ok' in part)) return part
    if (part.ok === null) continue
    parts.push(part.ok)
    blocks.push(block)
  }
  if (parts.length === 0) return { ok: null }
  return { ok: plainMessage(input.record.wire.roles.instruction, null, parts, blocks) }
}

function contentMessage(
  message: Extract<ChatMessage, { role: 'user' | 'compaction' | 'system_reminder' }>,
  path: string,
  role: WireRole,
  input: ProjectionInput,
): Outcome<WireMessage | null, TransportFailure> {
  const parts: WirePart[] = []
  const blocks: ProjectedPart[] = []
  for (const [index, block] of message.blocks.entries()) {
    const part = contentPart(
      block,
      `${path}/blocks/${index}`,
      input.record.wire.image,
      input.adapter,
    )
    if (!('ok' in part)) return part
    if (part.ok === null) continue
    parts.push(part.ok)
    blocks.push(block)
  }
  return { ok: parts.length === 0 ? null : plainMessage(role, message.id, parts, blocks) }
}

function assistantMessage(
  message: Extract<ChatMessage, { role: 'assistant' }>,
  path: string,
  treatment: ReplayTreatment,
  pending: PendingCalls,
  input: ProjectionInput,
): Outcome<WireMessage | null, TransportFailure> {
  const parts: WirePart[] = []
  const blocks: ProjectedPart[] = []
  const toolCalls: JsonValue[] = []
  const carried: ReplayPart[] = []
  const thinking: string[] = []
  const carry = new Set(treatment.continuable ? treatment.carry : [])
  const thinkingRule = treatment.thinking
  for (const [index, block] of message.blocks.entries()) {
    const at = `${path}/blocks/${index}`
    if (!block.visibility.toModel) continue
    switch (block.kind) {
      case 'reasoning_state':
        // A part that cannot continue is left out; projectReplay gives its diagnostic.
        if (carry.has(index) && message.replay !== undefined)
          carried.push({ payload: block.payload, format: message.replay.format })
        continue
      case 'thinking':
        switch (thinkingRule) {
          case 'omit':
            continue
          case 'text':
            if (block.text.length > 0) parts.push({ type: 'text', text: block.text })
            break
          case 'native':
          case 'adapter':
            thinking.push(block.text)
            break
          default: {
            const _exhaustive: never = thinkingRule
            return _exhaustive
          }
        }
        blocks.push(block)
        continue
      case 'tool_call':
      case 'tool_call_unparsed': {
        const args = block.kind === 'tool_call' ? writeJsonText(block.arguments) : block.raw
        const id = normalizeToolCallId(block.callId)
        toolCalls.push(
          object({
            id: text(id),
            type: text('function'),
            function: object({ name: text(block.name), arguments: text(args) }),
          }),
        )
        pending.set(id, at)
        blocks.push(block)
        continue
      }
      case 'tool_call_incomplete':
        return invalid(at, 'incomplete-tool-call')
      case 'text': {
        const part = contentPart(block, at, null, input.adapter)
        if (!('ok' in part)) return part
        if (part.ok !== null) {
          parts.push(part.ok)
          blocks.push(block)
        }
        continue
      }
      default: {
        // Media in an assistant message has no wire form here.
        const part = contentPart(block, at, null, input.adapter)
        if (!('ok' in part)) return part
        continue
      }
    }
  }
  const replay = replayWire({ carried, thinking, path, input })
  if (!('ok' in replay)) return replay
  if (parts.length === 0 && toolCalls.length === 0 && replay.ok.kind === 'none') return { ok: null }
  return {
    ok: {
      role: 'assistant',
      message: message.id,
      parts,
      blocks,
      toolCalls,
      replay: replay.ok,
      toolCallId: null,
    },
  }
}

function replayWire(
  input: Readonly<{
    carried: readonly ReplayPart[]
    thinking: readonly string[]
    path: string
    input: ProjectionInput
  }>,
): Outcome<ReplayWire, TransportFailure> {
  if (input.carried.length === 0 && input.thinking.length === 0) return { ok: { kind: 'none' } }
  const codec = input.input.hooks.reasoning
  if (codec === null) return unsupported(input.path, input.input.adapter)
  return codec.replay(input.carried, input.thinking)
}

function toolMessage(
  message: Extract<ChatMessage, { role: 'tool' }>,
  path: string,
  pending: PendingCalls,
  input: ProjectionInput,
): Outcome<
  Readonly<{
    message: WireMessage
    images: readonly WirePart[]
    imageBlocks: readonly ProjectedPart[]
  }>,
  TransportFailure
> {
  const [result, ...body] = message.blocks
  const id = normalizeToolCallId(result.callId)
  if (!pending.delete(id)) return invalid(`${path}/blocks/0`, 'orphan-tool-result')
  const parts: WirePart[] = []
  const blocks: ProjectedPart[] = [result]
  const images: WirePart[] = []
  const imageBlocks: ProjectedPart[] = []
  for (const [offset, block] of body.entries()) {
    const part = contentPart(
      block,
      `${path}/blocks/${offset + 1}`,
      input.record.wire.image,
      input.adapter,
    )
    if (!('ok' in part)) return part
    if (part.ok === null) continue
    if (part.ok.type === 'image') {
      images.push(part.ok)
      imageBlocks.push(block)
    } else {
      parts.push(part.ok)
      blocks.push(block)
    }
  }
  return {
    ok: {
      message: { ...plainMessage('tool', message.id, parts, blocks), toolCallId: id },
      images,
      imageBlocks,
    },
  }
}

/** The function tool of one declaration, its schema through the family hook. */
export function toolPayload(
  tool: ToolDeclaration,
  hooks: VendorHooks,
): Outcome<JsonValue, TransportFailure> {
  const schema = hooks.toolSchema(tool.argumentsSchema)
  if (!('ok' in schema)) return schema
  return {
    ok: object({
      type: text('function'),
      function: object({
        name: text(tool.name),
        description: text(tool.description),
        parameters: sorted(schema.ok),
      }),
    }),
  }
}

function toolChoiceOf(
  choice: FixedModelRequest['toolChoice'],
  tools: readonly ToolDeclaration[],
): Outcome<JsonValue | undefined, TransportFailure> {
  if (tools.length === 0)
    return choice === 'none' || choice === 'auto'
      ? { ok: undefined }
      : invalid('toolChoice', 'no-tools')
  if (typeof choice === 'string') return { ok: text(choice) }
  if (!tools.some(tool => tool.name === choice.name)) return invalid('toolChoice', 'unknown-tool')
  return { ok: object({ type: text('function'), function: object({ name: text(choice.name) }) }) }
}

// --- Writing the messages ------------------------------------------------------------------

/** Where the cache marker goes: a part of a message. */
export type CacheTarget = Readonly<{ message: number; part: number }>

/**
 * The cache target of `last-message`: the last non-empty text part of the last message, or, when
 * the last message is a user message of images only, its last image. `null` when there is none.
 */
export function cacheTarget(messages: readonly WireMessage[]): CacheTarget | null {
  const index = messages.length - 1
  const last = messages[index]
  if (last === undefined) return null
  const textPart = last.parts.findLastIndex(part => part.type === 'text' && part.text.length > 0)
  if (textPart >= 0) return { message: index, part: textPart }
  const imagesOnly =
    last.role === 'user' && last.parts.length > 0 && last.parts.every(part => part.type === 'image')
  return imagesOnly ? { message: index, part: last.parts.length - 1 } : null
}

function partJson(part: WirePart, cache: JsonValue | undefined): JsonValue {
  switch (part.type) {
    case 'text':
      return object({ type: text('text'), text: text(part.text), cache_control: cache })
    case 'image':
      return object({
        type: text('image_url'),
        image_url: object({ url: text(part.url), detail: text(part.detail) }),
        cache_control: cache,
      })
    default: {
      const _exhaustive: never = part
      return _exhaustive
    }
  }
}

function contentJson(
  message: WireMessage,
  mode: WireProfile['content'],
  cachedPart: number | null,
  cache: JsonValue,
): JsonValue {
  const [only] = message.parts
  if (
    mode === 'compact' &&
    message.parts.length === 1 &&
    only?.type === 'text' &&
    cachedPart === null
  )
    return text(only.text)
  if (mode === 'compact' && message.parts.length === 0) return text('')
  return list(
    message.parts.map((part, index) => partJson(part, index === cachedPart ? cache : undefined)),
  )
}

function replayMembers(replay: ReplayWire): Readonly<Record<string, JsonValue>> {
  switch (replay.kind) {
    case 'none':
      return {}
    case 'plain':
      return { reasoning: text(replay.text) }
    case 'details':
      return { reasoning_details: list(replay.details.map(detail => sorted(object(detail)))) }
    default: {
      const _exhaustive: never = replay
      return _exhaustive
    }
  }
}

/** The JSON of the gateway messages, with the cache marker on `target` when it is not `null`. */
export function messagesJson(
  messages: readonly WireMessage[],
  wire: WireProfile,
  target: CacheTarget | null,
): JsonValue {
  const cache =
    wire.cache.kind === 'last-message'
      ? object({ type: text('ephemeral'), ttl: text(wire.cache.ttl) })
      : object({})
  return list(
    messages.map((message, index) => {
      const cachedPart = target !== null && target.message === index ? target.part : null
      const content = contentJson(message, wire.content, cachedPart, cache)
      switch (message.role) {
        case 'assistant':
          return object({
            role: text('assistant'),
            content,
            tool_calls: message.toolCalls.length > 0 ? list(message.toolCalls) : undefined,
            ...replayMembers(message.replay),
          })
        case 'tool':
          return object({
            role: text('tool'),
            tool_call_id: text(message.toolCallId ?? ''),
            content,
          })
        case 'system':
        case 'developer':
        case 'user':
          return object({ role: text(message.role), content })
        default: {
          const _exhaustive: never = message.role
          return _exhaustive
        }
      }
    }),
  )
}
