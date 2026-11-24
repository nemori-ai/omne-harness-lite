import { sentFile, sentImage, sentWords, type MediaView } from '../media.ts'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
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
import { readThinking, thinkingJson } from './reasoning.ts'
import type { MessagesRecord, ThinkingBlock } from './vocabulary.ts'

export type MessagesTurn = Readonly<{
  role: 'user' | 'assistant'
  content: readonly JsonValue[]
}>

export type MessagesProjection = Readonly<{
  system: readonly JsonValue[]
  turns: readonly MessagesTurn[]
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

export type MessagesProjectionInput = Readonly<{
  record: MessagesRecord
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

type Built = {
  turns: MessagesTurn[]
  view: ProjectedTurn[]
  pending: Map<string, string>
  results: number | null
}

function unsupported(field: string, adapter: Adoption): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unsupported', field, adapter } }
}

function invalid(field: string, reason: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

function documentJson(
  block: ContentBlock,
  path: string,
  input: MessagesProjectionInput,
): Outcome<JsonValue, TransportFailure> {
  const words = sentWords(block, input.media)
  if (words !== null) return { ok: object({ type: text('text'), text: text(words) }) }
  const sent = sentFile(block, input.record.wire.file, input.media)
  if (sent === null) return unsupported(path, input.adapter)
  const source = object({
    type: text('base64'),
    media_type: text(sent.mime),
    data: text(sent.data),
  })
  return { ok: object({ type: text('document'), source }) }
}

function contentJson(
  block: ContentBlock,
  path: string,
  input: MessagesProjectionInput,
): Outcome<JsonValue | null, TransportFailure> {
  if (!block.visibility.toModel) return { ok: null }
  if (block.kind === 'text') return { ok: object({ type: text('text'), text: text(block.text) }) }
  if (block.kind === 'file') return documentJson(block, path, input)
  const sent = sentImage(block, input.record.wire.image?.mediaTypes, input.media)
  if (sent === null) return unsupported(path, input.adapter)
  const source = object({
    type: text('base64'),
    media_type: text(sent.mime),
    data: text(sent.data),
  })
  return { ok: object({ type: text('image'), source }) }
}

export function projectMessages(
  input: MessagesProjectionInput,
): Outcome<MessagesProjection, TransportFailure> {
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
  const treatments = new Map(replay.treatments.map(treatment => [treatment.index, treatment]))
  const system: JsonValue[] = []
  for (const [index, block] of input.system.entries()) {
    const json = contentJson(block, `/system/${index}`, input)
    if (!('ok' in json)) return json
    if (json.ok !== null) system.push(json.ok)
  }
  const built: Built = { turns: [], view: [], pending: new Map(), results: null }
  for (const [index, message] of input.messages.entries()) {
    const added = addMessage(built, message, `/messages/${index}`, {
      input,
      names: named.ok,
      treatment: treatments.get(index),
    })
    if (!('ok' in added)) return added
  }
  const orphan = built.pending.values().next()
  if (orphan.done !== true) return invalid(orphan.value, 'orphan-tool-call')
  const last = built.turns.at(-1)
  if (last?.role === 'assistant' && !input.record.accepts.endsWithAssistant)
    return unsupported(`/messages/${input.messages.length - 1}`, input.adapter)
  const tools = toolsJson(input, named.ok)
  if (!('ok' in tools)) return tools
  const choice = toolChoiceOf(input, named.ok)
  if (!('ok' in choice)) return choice
  return {
    ok: {
      system,
      turns: built.turns,
      view: built.view,
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

type MessageContext = Readonly<{
  input: MessagesProjectionInput
  names: ToolNames
  treatment: ReplayTreatment | undefined
}>

function addMessage(
  built: Built,
  message: ChatMessage,
  path: string,
  context: MessageContext,
): Outcome<void, TransportFailure> {
  switch (message.role) {
    case 'tool_internal':
      return { ok: undefined }
    case 'user':
    case 'compaction':
    case 'system_reminder':
      built.results = null
      return addUser(built, message, path, context.input)
    case 'assistant': {
      built.results = null
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

function addUser(
  built: Built,
  message: Extract<ChatMessage, { role: 'user' | 'compaction' | 'system_reminder' }>,
  path: string,
  input: MessagesProjectionInput,
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
  built.turns.push({ role: 'user', content })
  built.view.push({ message: message.id, role: 'user', blocks, replay: { kind: 'none' } })
  return { ok: undefined }
}

type AssistantBlock = Extract<ChatMessage, { role: 'assistant' }>['blocks'][number]

type AssistantParts = {
  payloads: string[]
  thoughts: string[]
  content: JsonValue[]
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
  parts.content.push(object({ type: text('text'), text: text(block.text) }))
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
      const args = block.kind === 'tool_call' ? block.arguments : unparsedArguments(block.raw)
      parts.content.push(
        object({ type: text('tool_use'), id: text(id), name: text(name), input: sorted(args) }),
      )
      context.pending.set(id, at.path)
      parts.blocks.push({ ...block, name })
      return { ok: undefined }
    }
    case 'tool_call_incomplete':
      return invalid(at.path, 'incomplete-tool-call')
    case 'text':
      parts.content.push(object({ type: text('text'), text: text(block.text) }))
      parts.blocks.push(block)
      return { ok: undefined }
    default: {
      const json = contentJson(block, at.path, context.input)
      return 'ok' in json ? { ok: undefined } : json
    }
  }
}

function addAssistant(
  built: Built,
  message: Extract<ChatMessage, { role: 'assistant' }>,
  path: string,
  context: MessageContext & Readonly<{ treatment: ReplayTreatment }>,
): Outcome<void, TransportFailure> {
  const { treatment, input } = context
  const carry = new Set(treatment.continuable ? treatment.carry : [])
  const parts: AssistantParts = { payloads: [], thoughts: [], content: [], blocks: [] }
  const full: AssistantContext = { ...context, carry, pending: built.pending }
  for (const [index, block] of message.blocks.entries()) {
    if (!block.visibility.toModel) continue
    const added = assistantPart(parts, block, { index, path: `${path}/blocks/${index}` }, full)
    if (!('ok' in added)) return added
  }
  const thinking = replayedThinking(parts.payloads, parts.thoughts, treatment, path, input)
  if (!('ok' in thinking)) return thinking
  if (thinking.ok.length === 0 && parts.content.length === 0) return { ok: undefined }
  built.turns.push({
    role: 'assistant',
    content: [...thinking.ok.map(thinkingJson), ...parts.content],
  })
  built.view.push({
    message: message.id,
    role: 'assistant',
    blocks: parts.blocks,
    replay:
      thinking.ok.length === 0
        ? { kind: 'none' }
        : { kind: 'details', details: thinking.ok.map(detailOf) },
  })
  return { ok: undefined }
}

// Arguments the model wrote as text that is not an object go back as an empty object; the
// tool result that follows carries what went wrong.
function unparsedArguments(raw: string): JsonValue {
  const read = readJsonText(raw, {
    maxBytes: raw.length * 4 + 2,
    maxDepth: 64,
    maxItems: raw.length + 1,
    maxMembers: raw.length + 1,
    maxStringLength: raw.length + 1,
    maxNumberLength: raw.length + 1,
  })
  return read.kind === 'ok' && read.value.kind === 'object'
    ? read.value
    : { kind: 'object', entries: [] }
}

function detailOf(block: ThinkingBlock): Readonly<Record<string, JsonValue>> {
  const json = thinkingJson(block)
  if (json.kind !== 'object') throw new Error('a thinking block is an object')
  return Object.fromEntries(json.entries.map(entry => [entry.key, entry.value]))
}

function replayedThinking(
  payloads: readonly string[],
  thoughts: readonly string[],
  treatment: ReplayTreatment,
  path: string,
  input: MessagesProjectionInput,
): Outcome<readonly ThinkingBlock[], TransportFailure> {
  if (payloads.length === 0)
    return treatment.continuable || thoughts.every(thought => thought.length === 0)
      ? { ok: [] }
      : unsupported(path, input.adapter)
  const blocks: ThinkingBlock[] = []
  for (const payload of payloads) {
    const read = readThinking(payload)
    if (read === null) return invalid('reasoning_state', 'payload-not-replayable')
    blocks.push(...read)
  }
  return { ok: blocks }
}

function addResult(
  built: Built,
  message: Extract<ChatMessage, { role: 'tool' }>,
  path: string,
  input: MessagesProjectionInput,
): Outcome<void, TransportFailure> {
  const [result, ...body] = message.blocks
  const id = normalizeToolCallId(result.callId)
  if (!built.pending.delete(id)) return invalid(`${path}/blocks/0`, 'orphan-tool-result')
  const content: JsonValue[] = []
  const blocks: ProjectedPart[] = [result]
  for (const [offset, block] of body.entries()) {
    const json = contentJson(block, `${path}/blocks/${offset + 1}`, input)
    if (!('ok' in json)) return json
    if (json.ok === null) continue
    content.push(json.ok)
    blocks.push(block)
  }
  const part = object({
    type: text('tool_result'),
    tool_use_id: text(id),
    content: list(content),
  })
  const view: ProjectedTurn = {
    message: message.id,
    role: 'tool',
    blocks,
    replay: { kind: 'none' },
  }
  const open = built.results === null ? undefined : built.turns[built.results]
  if (open === undefined) {
    built.results = built.turns.length
    built.turns.push({ role: 'user', content: [part] })
  } else built.turns[built.results as number] = { ...open, content: [...open.content, part] }
  built.view.push(view)
  return { ok: undefined }
}

function toolsJson(
  input: MessagesProjectionInput,
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
    json.push(
      object({
        name: text(name),
        description: text(tool.description),
        input_schema: sorted(tool.argumentsSchema),
      }),
    )
    declared.push({ ...tool, name })
  }
  return { ok: { json, declared } }
}

function toolChoiceOf(
  input: MessagesProjectionInput,
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
  if (choice === 'auto' || choice === 'none')
    return { ok: { json: object({ type: text(choice) }), choice } }
  if (!input.record.accepts.forcedToolChoice) return unsupported('toolChoice', input.adapter)
  if (choice === 'required') return { ok: { json: object({ type: text('any') }), choice } }
  if (!tools.some(tool => tool.name === choice.name)) return invalid('toolChoice', 'unknown-tool')
  const name = names.wire(choice.name)
  return { ok: { json: object({ type: text('tool'), name: text(name) }), choice: { name } } }
}
