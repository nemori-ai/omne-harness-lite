import { referredImage, type MediaView } from '../media.ts'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Adoption,
  FixedModelRequest,
  ReplayDeclaration,
  ToolDeclaration,
  TransportFailure,
} from '@omne-harness/model-contract'
import {
  projectReplay,
  type ReplayDiagnostic,
  type ReplayTreatment,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { list, object, sorted, text } from '../chat-completions/json.ts'
import { normalizeToolCallId } from '../chat-completions/projection.ts'
import { toolNamesOf, type ToolNames } from '../chat-completions/tool-names.ts'
import type {
  ChatMessage,
  ChatMessageId,
  ProjectedPart,
  ProjectedTurn,
} from '../chat-completions/vocabulary.ts'
import { readItems } from './reasoning.ts'
import type { ItemEntry, ResponsesRecord } from './vocabulary.ts'

type Members = Readonly<Record<string, JsonValue>>

/** One input item: a message keeps its parts apart so the cache mark can go on one of them. */
export type ResponsesItem =
  | Readonly<{ kind: 'message'; members: Members; content: readonly JsonValue[] }>
  | Readonly<{ kind: 'item'; json: JsonValue }>

export type ResponsesProjection = Readonly<{
  instructions: string | null
  items: readonly ResponsesItem[]
  view: readonly ProjectedTurn[]
  instruction: readonly ContentBlock[]
  tools: readonly JsonValue[]
  declared: readonly ToolDeclaration[]
  toolChoice: JsonValue | undefined
  choice: FixedModelRequest['toolChoice']
  treatments: readonly ReplayTreatment[]
  diagnostics: readonly ReplayDiagnostic[]
  replayPrefix: string
}>

export type ResponsesProjectionInput = Readonly<{
  record: ResponsesRecord
  adapter: Adoption
  declaration: ReplayDeclaration
  system: readonly ContentBlock[]
  messages: readonly ChatMessage[]
  tools: readonly ToolDeclaration[]
  toolChoice: FixedModelRequest['toolChoice']
  replayOff: boolean
  resent: ReadonlySet<ChatMessageId>
  media: MediaView
}>

type Images = { message: ChatMessageId; content: JsonValue[]; blocks: ProjectedPart[] }

type Built = {
  items: ResponsesItem[]
  view: ProjectedTurn[]
  pending: Map<string, string>
  images: Images | null
  last: ProjectedTurn['role'] | null
}

function unsupported(field: string, adapter: Adoption): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unsupported', field, adapter } }
}

function invalid(field: string, reason: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

const NOT_REPLAYABLE = invalid('reasoning_state', 'payload-not-replayable')

function messageItem(
  role: string,
  content: readonly JsonValue[],
  members: Members = {},
): ResponsesItem {
  return { kind: 'message', members: { ...members, role: text(role) }, content }
}

function outputText(value: string): JsonValue {
  return object({ type: text('output_text'), text: text(value), annotations: list([]) })
}

function contentJson(
  block: ContentBlock,
  path: string,
  input: ResponsesProjectionInput,
): Outcome<JsonValue | null, TransportFailure> {
  if (!block.visibility.toModel) return { ok: null }
  if ('ref' in block) {
    const referred = referredImage(block, input.record.wire.image?.mediaTypes, input.media)
    if (referred === null) return unsupported(path, input.adapter)
    const url = `data:${referred.mime};base64,${referred.data}`
    return { ok: object({ type: text('input_image'), image_url: text(url) }) }
  }
  switch (block.kind) {
    case 'text':
      return { ok: object({ type: text('input_text'), text: text(block.text) }) }
    case 'image': {
      const image = input.record.wire.image
      if (image === null || !image.mediaTypes.includes(block.mediaType))
        return unsupported(path, input.adapter)
      const url = `data:${block.mediaType};base64,${block.inline}`
      return { ok: object({ type: text('input_image'), image_url: text(url) }) }
    }
    case 'voice':
    case 'file':
    case 'thinking':
      return unsupported(path, input.adapter)
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

// The system prompt is one text: its shown text blocks joined as they are.
function systemText(input: ResponsesProjectionInput): Outcome<string | null, TransportFailure> {
  const texts: string[] = []
  for (const [index, block] of input.system.entries()) {
    if (!block.visibility.toModel) continue
    if ('ref' in block || block.kind !== 'text')
      return unsupported(`/system/${index}`, input.adapter)
    texts.push(block.text)
  }
  return { ok: texts.length === 0 ? null : texts.join('') }
}

export function projectResponses(
  input: ResponsesProjectionInput,
): Outcome<ResponsesProjection, TransportFailure> {
  const named = toolNamesOf({
    profile: input.record.wire.toolNames,
    tools: input.tools,
    messages: input.messages,
    adapter: input.adapter,
  })
  if (!('ok' in named)) return named
  const replay = projectReplay({
    messages: input.messages,
    declaration: input.declaration,
    formats: new Set(input.record.replay.formats.accepts),
    off: input.replayOff,
    resent: input.resent,
    system: input.system,
    tools: input.tools,
    binding: input.record.replay.binding,
  })
  const system = systemText(input)
  if (!('ok' in system)) return system
  const built = conversation(input, named.ok, replay.treatments, system.ok)
  if (!('ok' in built)) return built
  const tools = toolsJson(input, named.ok)
  if (!('ok' in tools)) return tools
  const choice = toolChoiceOf(input, named.ok)
  if (!('ok' in choice)) return choice
  return {
    ok: {
      instructions: input.record.wire.system === 'instructions' ? system.ok : null,
      items: built.ok.items,
      view: built.ok.view,
      instruction: input.system.filter(block => block.visibility.toModel),
      tools: tools.ok.json,
      declared: tools.ok.declared,
      toolChoice: choice.ok.json,
      choice: choice.ok.choice,
      treatments: replay.treatments,
      diagnostics: replay.diagnostics,
      replayPrefix: replay.prefix,
    },
  }
}

function conversation(
  input: ResponsesProjectionInput,
  names: ToolNames,
  treatments: readonly ReplayTreatment[],
  system: string | null,
): Outcome<Built, TransportFailure> {
  const treated = new Map(treatments.map(treatment => [treatment.index, treatment]))
  const built: Built = { items: [], view: [], pending: new Map(), images: null, last: null }
  if (system !== null && input.record.wire.system === 'developer')
    built.items.push(
      messageItem('developer', [object({ type: text('input_text'), text: text(system) })]),
    )
  for (const [index, message] of input.messages.entries()) {
    const context = { input, names, treatment: treated.get(index) }
    const added = addMessage(built, message, `/messages/${index}`, context)
    if (!('ok' in added)) return added
  }
  flushImages(built)
  const orphan = built.pending.values().next()
  if (orphan.done !== true) return invalid(orphan.value, 'orphan-tool-call')
  if (built.last === 'assistant' && !input.record.accepts.endsWithAssistant)
    return unsupported(`/messages/${input.messages.length - 1}`, input.adapter)
  return { ok: built }
}

type MessageContext = Readonly<{
  input: ResponsesProjectionInput
  names: ToolNames
  treatment: ReplayTreatment | undefined
}>

function addMessage(
  built: Built,
  message: ChatMessage,
  path: string,
  context: MessageContext,
): Outcome<void, TransportFailure> {
  if (message.role !== 'tool') flushImages(built)
  switch (message.role) {
    case 'tool_internal':
      return { ok: undefined }
    case 'user':
    case 'compaction':
      return addContent(built, message, path, context.input, 'user')
    case 'system_reminder':
      return addContent(built, message, path, context.input, 'developer')
    case 'assistant': {
      if (context.treatment === undefined)
        throw new Error(`the replay projection lacks message ${path}`)
      return addAssistant(built, message, path, { ...context, treatment: context.treatment })
    }
    case 'tool':
      return addResult(built, message, path, context.input)
    default: {
      const _exhaustive: never = message
      return _exhaustive
    }
  }
}

function addContent(
  built: Built,
  message: Extract<ChatMessage, { role: 'user' | 'compaction' | 'system_reminder' }>,
  path: string,
  input: ResponsesProjectionInput,
  role: 'user' | 'developer',
): Outcome<void, TransportFailure> {
  const content: JsonValue[] = []
  const blocks: ProjectedPart[] = []
  for (const [index, block] of message.blocks.entries()) {
    const json = contentJson(block, `${path}/blocks/${index}`, input)
    if (!('ok' in json)) return json
    if (json.ok === null) continue
    content.push(json.ok)
    blocks.push(block)
  }
  if (content.length === 0) return { ok: undefined }
  built.items.push(messageItem(role, content))
  built.view.push({ message: message.id, role, blocks, replay: { kind: 'none' } })
  built.last = role
  return { ok: undefined }
}

type AssistantBlock = Extract<ChatMessage, { role: 'assistant' }>['blocks'][number]

type Call = Readonly<{ callId: string; id: string; name: string; arguments: string }>

type AssistantParts = {
  payloads: string[]
  thoughts: string[]
  content: JsonValue[]
  calls: Call[]
  blocks: ProjectedPart[]
}

type AssistantContext = MessageContext &
  Readonly<{ treatment: ReplayTreatment; carry: ReadonlySet<number>; pending: Built['pending'] }>

function thinkingPart(
  parts: AssistantParts,
  block: Extract<AssistantBlock, { kind: 'thinking' }>,
  rule: ReplayTreatment['thinking'],
): void {
  if (rule === 'omit') return
  if (rule !== 'text') {
    parts.thoughts.push(block.text)
    return
  }
  parts.content.push(outputText(block.text))
  parts.blocks.push({ kind: 'text', id: block.id, visibility: block.visibility, text: block.text })
}

function assistantPart(
  parts: AssistantParts,
  block: AssistantBlock,
  at: Readonly<{ index: number; path: string }>,
  context: AssistantContext,
): Outcome<void, TransportFailure> {
  switch (block.kind) {
    case 'reasoning_state':
      if (context.carry.has(at.index)) parts.payloads.push(block.payload)
      return { ok: undefined }
    case 'thinking':
      thinkingPart(parts, block, context.treatment.thinking)
      return { ok: undefined }
    case 'tool_call':
    case 'tool_call_unparsed': {
      const id = normalizeToolCallId(block.callId)
      const name = context.names.wire(block.name)
      const args = block.kind === 'tool_call' ? writeJsonText(block.arguments) : block.raw
      parts.calls.push({ callId: block.callId, id, name, arguments: args })
      context.pending.set(id, at.path)
      parts.blocks.push({ ...block, name })
      return { ok: undefined }
    }
    case 'tool_call_incomplete':
      return invalid(at.path, 'incomplete-tool-call')
    case 'text':
      parts.content.push(outputText(block.text))
      parts.blocks.push(block)
      return { ok: undefined }
    default: {
      const json = contentJson(block, at.path, context.input)
      return 'ok' in json ? { ok: undefined } : json
    }
  }
}

type Replied = Readonly<{ items: readonly ResponsesItem[]; reasoning: readonly JsonValue[] }>

function addAssistant(
  built: Built,
  message: Extract<ChatMessage, { role: 'assistant' }>,
  path: string,
  context: MessageContext & Readonly<{ treatment: ReplayTreatment }>,
): Outcome<void, TransportFailure> {
  const parts = assistantParts(built, message, path, context)
  if (!('ok' in parts)) return parts
  const replied =
    parts.ok.payloads.length === 0
      ? plainReply(parts.ok, context.treatment, path, context.input)
      : carriedReply(parts.ok)
  if (!('ok' in replied)) return replied
  const { items, reasoning } = replied.ok
  if (items.length === 0) return { ok: undefined }
  built.items.push(...items)
  built.view.push({
    message: message.id,
    role: 'assistant',
    blocks: parts.ok.blocks,
    replay:
      reasoning.length === 0
        ? { kind: 'none' }
        : { kind: 'details', details: reasoning.map(detailOf) },
  })
  built.last = 'assistant'
  return { ok: undefined }
}

function assistantParts(
  built: Built,
  message: Extract<ChatMessage, { role: 'assistant' }>,
  path: string,
  context: MessageContext & Readonly<{ treatment: ReplayTreatment }>,
): Outcome<AssistantParts, TransportFailure> {
  const { treatment } = context
  const carry = new Set(treatment.continuable ? treatment.carry : [])
  const parts: AssistantParts = { payloads: [], thoughts: [], content: [], calls: [], blocks: [] }
  const full: AssistantContext = { ...context, carry, pending: built.pending }
  for (const [index, block] of message.blocks.entries()) {
    if (!block.visibility.toModel) continue
    const added = assistantPart(parts, block, { index, path: `${path}/blocks/${index}` }, full)
    if (!('ok' in added)) return added
  }
  return { ok: parts }
}

// A reply that carries nothing back: its text as one message, then its calls in order.
function plainReply(
  parts: AssistantParts,
  treatment: ReplayTreatment,
  path: string,
  input: ResponsesProjectionInput,
): Outcome<Replied, TransportFailure> {
  if (!treatment.continuable && parts.thoughts.some(thought => thought !== ''))
    return unsupported(path, input.adapter)
  const items: ResponsesItem[] =
    parts.content.length === 0 ? [] : [messageItem('assistant', parts.content)]
  for (const call of parts.calls)
    items.push({
      kind: 'item',
      json: object({
        type: text('function_call'),
        call_id: text(call.id),
        name: text(call.name),
        arguments: text(call.arguments),
      }),
    })
  return { ok: { items, reasoning: [] } }
}

// A reply that carries its items back in their order, its text and calls taken from its blocks.
function carriedReply(parts: AssistantParts): Outcome<Replied, TransportFailure> {
  const entries: ItemEntry[] = []
  for (const payload of parts.payloads) {
    const read = readItems(payload)
    if (read === null) return NOT_REPLAYABLE
    entries.push(...read)
  }
  const taken = { content: 0, calls: 0 }
  const items: ResponsesItem[] = []
  for (const entry of entries) {
    const item = rebuiltItem(entry, parts, taken)
    if (item === null) return NOT_REPLAYABLE
    items.push(item)
  }
  if (taken.content !== parts.content.length || taken.calls !== parts.calls.length)
    return NOT_REPLAYABLE
  const reasoning = entries.flatMap(entry => (entry.type === 'reasoning' ? [entry.item] : []))
  return { ok: { items, reasoning } }
}

function rebuiltItem(
  entry: ItemEntry,
  parts: AssistantParts,
  taken: { content: number; calls: number },
): ResponsesItem | null {
  switch (entry.type) {
    case 'reasoning':
      return { kind: 'item', json: entry.item }
    case 'message': {
      const content = parts.content.slice(taken.content, taken.content + entry.parts)
      taken.content += entry.parts
      const members: Record<string, JsonValue> = { id: text(entry.id), status: text('completed') }
      if (entry.phase !== null) members['phase'] = text(entry.phase)
      return messageItem('assistant', content, members)
    }
    case 'function_call': {
      const call = parts.calls[taken.calls]
      if (call?.callId !== entry.callId) return null
      taken.calls += 1
      const json = object({
        type: text('function_call'),
        id: text(entry.id),
        call_id: text(call.id),
        name: text(call.name),
        arguments: text(call.arguments),
        status: text('completed'),
      })
      return { kind: 'item', json }
    }
    default: {
      const _exhaustive: never = entry
      return _exhaustive
    }
  }
}

function detailOf(item: JsonValue): Readonly<Record<string, JsonValue>> {
  if (item.kind !== 'object') throw new Error('a reasoning item is an object')
  return Object.fromEntries(item.entries.map(entry => [entry.key, entry.value]))
}

function addResult(
  built: Built,
  message: Extract<ChatMessage, { role: 'tool' }>,
  path: string,
  input: ResponsesProjectionInput,
): Outcome<void, TransportFailure> {
  const [result, ...body] = message.blocks
  const id = normalizeToolCallId(result.callId)
  if (!built.pending.delete(id)) return invalid(`${path}/blocks/0`, 'orphan-tool-result')
  const texts: string[] = []
  const blocks: ProjectedPart[] = [result]
  for (const [offset, block] of body.entries()) {
    const json = contentJson(block, `${path}/blocks/${offset + 1}`, input)
    if (!('ok' in json)) return json
    if (json.ok === null) continue
    if (block.kind === 'text') {
      texts.push(block.text)
      blocks.push(block)
      continue
    }
    built.images ??= { message: message.id, content: [], blocks: [] }
    built.images.content.push(json.ok)
    built.images.blocks.push(block)
  }
  built.items.push({
    kind: 'item',
    json: object({
      type: text('function_call_output'),
      call_id: text(id),
      output: text(texts.join('')),
    }),
  })
  built.view.push({ message: message.id, role: 'tool', blocks, replay: { kind: 'none' } })
  built.last = 'tool'
  return { ok: undefined }
}

// Images of tool results go in one user message after the results.
function flushImages(built: Built): void {
  const images = built.images
  built.images = null
  if (images === null || images.content.length === 0) return
  built.items.push(messageItem('user', images.content))
  built.view.push({
    message: images.message,
    role: 'user',
    blocks: images.blocks,
    replay: { kind: 'none' },
  })
  built.last = 'user'
}

export function toolJson(name: string, tool: ToolDeclaration): JsonValue {
  return object({
    type: text('function'),
    name: text(name),
    description: text(tool.description),
    parameters: sorted(tool.argumentsSchema),
  })
}

function toolsJson(
  input: ResponsesProjectionInput,
  names: ToolNames,
): Outcome<
  Readonly<{ json: readonly JsonValue[]; declared: readonly ToolDeclaration[] }>,
  TransportFailure
> {
  const json: JsonValue[] = []
  const declared: ToolDeclaration[] = []
  for (const [index, tool] of input.tools.entries()) {
    if (tool.argumentsSchema.kind !== 'object')
      return unsupported(`/tools/${index}/argumentsSchema`, input.adapter)
    const name = names.wire(tool.name)
    json.push(toolJson(name, tool))
    declared.push({ ...tool, name })
  }
  return { ok: { json, declared } }
}

function toolChoiceOf(
  input: ResponsesProjectionInput,
  names: ToolNames,
): Outcome<
  Readonly<{ json: JsonValue | undefined; choice: FixedModelRequest['toolChoice'] }>,
  TransportFailure
> {
  const { toolChoice: choice, tools } = input
  if (tools.length === 0)
    return choice === 'none' || choice === 'auto'
      ? { ok: { json: undefined, choice } }
      : invalid('toolChoice', 'no-tools')
  if (choice === 'auto' || choice === 'none') return { ok: { json: text(choice), choice } }
  if (!input.record.accepts.forcedToolChoice) return unsupported('toolChoice', input.adapter)
  if (choice === 'required') return { ok: { json: text('required'), choice } }
  if (!tools.some(tool => tool.name === choice.name)) return invalid('toolChoice', 'unknown-tool')
  const name = names.wire(choice.name)
  return {
    ok: { json: object({ type: text('function'), name: text(name) }), choice: { name } },
  }
}
