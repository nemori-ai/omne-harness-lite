// The conversation as the view draws it: committed entries and the live reply turned into items and
// parts. The three sources are closed (RFC-0015 §10「对话」): history kinds, message parts, live
// blocks. Anything outside them becomes a visible placeholder that names its kind.
import type { Content, HistoryEntry, LiveBlock } from './content.ts'
import { isRecord, listOf, textOf, type Plain } from './plain.ts'

export type AskOption = Readonly<{ label: string; description: string }>
export type AskQuestion = Readonly<{
  title: string
  description: string
  options: readonly AskOption[]
}>
export type AskStatus = 'waiting' | 'answered' | 'expired'
export type AskView = Readonly<{ questions: readonly AskQuestion[]; status: AskStatus }>

export type ToolResultView = Readonly<{ parts: readonly Part[] }>

export type Part =
  | Readonly<{ kind: 'text'; key: string; text: string }>
  | Readonly<{ kind: 'thinking'; key: string; text: string }>
  | Readonly<{
      kind: 'tool-call'
      key: string
      callId: string | null
      name: string | null
      /** The arguments as data, or the raw text when they did not (yet) decode. */
      arguments: Plain
      raw: string | null
      state: 'complete' | 'incomplete' | 'unparsed' | 'generating'
      result: ToolResultView | null
      ask: AskView | null
    }>
  | Readonly<{ kind: 'tool-result'; key: string; callId: string; result: ToolResultView }>
  | Readonly<{ kind: 'media'; key: string; media: string; detail: string }>
  | Readonly<{ kind: 'unknown'; key: string; partKind: string }>

export type Item =
  | Readonly<{
      kind: 'message'
      key: string
      role: 'user' | 'assistant' | 'tool'
      parts: readonly Part[]
      live: boolean
    }>
  /** A system note the producer marked for people: one collapsed line, opened on demand. */
  | Readonly<{ kind: 'note'; key: string; label: string; parts: readonly Part[] }>
  | Readonly<{ kind: 'marker'; key: string; label: string }>
  | Readonly<{ kind: 'unknown'; key: string; entryKind: string }>

const ASK_TOOL = 'Ask'

function contentPart(block: Plain, key: string): Part {
  if (!isRecord(block)) return { kind: 'unknown', key, partKind: typeof block }
  const kind = textOf(block['kind']) ?? '(none)'
  switch (kind) {
    case 'text':
      return { kind: 'text', key, text: textOf(block['text']) ?? '' }
    case 'thinking':
      return { kind: 'thinking', key, text: textOf(block['text']) ?? '' }
    case 'image':
    case 'file':
    case 'voice':
      return {
        kind: 'media',
        key,
        media: kind,
        detail: textOf(block['transcript']) ?? textOf(block['mediaType']) ?? '',
      }
    case 'tool_call':
      return toolCall(key, block, 'complete')
    case 'tool_call_incomplete':
      return toolCall(key, block, 'incomplete')
    case 'tool_call_unparsed':
      return toolCall(key, block, 'unparsed')
    default:
      return { kind: 'unknown', key, partKind: kind }
  }
}

function toolCall(
  key: string,
  block: { readonly [key: string]: Plain },
  state: 'complete' | 'incomplete' | 'unparsed',
): Part {
  const raw = textOf(block['partial']) ?? textOf(block['raw']) ?? null
  return {
    kind: 'tool-call',
    key,
    callId: textOf(block['callId']) ?? null,
    name: textOf(block['name']) ?? null,
    arguments: state === 'complete' ? (block['arguments'] ?? null) : null,
    raw,
    state,
    result: null,
    ask: null,
  }
}

/** The parts of one message. A tool result marker takes the content blocks after it as its body. */
function messageParts(blocks: readonly Plain[], prefix: string): Part[] {
  const parts: Part[] = []
  let body: Part[] | null = null
  blocks.forEach((block, at) => {
    const key = `${prefix}:${at}`
    if (isRecord(block) && block['kind'] === 'reasoning_state') return
    if (isRecord(block) && block['kind'] === 'tool_result') {
      body = []
      parts.push({
        kind: 'tool-result',
        key,
        callId: textOf(block['callId']) ?? '',
        result: { parts: body },
      })
      return
    }
    const part = contentPart(block, key)
    if (body !== null && part.kind !== 'tool-call') body.push(part)
    else parts.push(part)
  })
  return parts
}

function messageOf(entry: HistoryEntry): { role: string; blocks: readonly Plain[] } | null {
  const payload = entry.payload
  const message = isRecord(payload) ? payload['message'] : undefined
  if (!isRecord(message)) return null
  return { role: textOf(message['role']) ?? '', blocks: listOf(message['blocks']) }
}

function liveParts(blocks: readonly LiveBlock[]): Part[] {
  return blocks.flatMap((block): Part[] => {
    const key = `live:${block.index}`
    if (block.kind === 'sealed') {
      if (isRecord(block.block) && block.block['kind'] === 'reasoning_state') return []
      return [contentPart(block.block, key)]
    }
    switch (block.content) {
      case 'text':
        return [{ kind: 'text', key, text: block.value }]
      case 'thinking':
        return [{ kind: 'thinking', key, text: block.value }]
      case 'tool-arguments':
        return [
          {
            kind: 'tool-call',
            key,
            callId: null,
            name: null,
            arguments: null,
            raw: block.value,
            state: 'generating',
            result: null,
            ask: null,
          },
        ]
      case 'voice':
        return [{ kind: 'media', key, media: 'voice', detail: '' }]
      default:
        return [{ kind: 'unknown', key, partKind: block.content }]
    }
  })
}

function askQuestions(args: Plain): readonly AskQuestion[] | null {
  if (!isRecord(args)) return null
  const params = isRecord(args['params']) ? args['params'] : args
  const command = textOf(args['command'])
  if (command === 'request_approval') {
    const action = textOf(params['action']) ?? ''
    const detail = ['reason', 'impact', 'reversibility', 'fallback']
      .map(field => textOf(params[field]))
      .filter((text): text is string => text !== undefined)
      .join('\n')
    return [
      {
        title: action,
        description: detail,
        options: [
          { label: '同意', description: '同意执行这个动作。' },
          { label: '不同意', description: '不同意，这个动作不会执行。' },
        ],
      },
    ]
  }
  const questions = listOf(params['questions'])
  if (questions.length === 0) return null
  return questions.map(question => {
    const record = isRecord(question) ? question : {}
    return {
      title: textOf(record['title']) ?? '',
      description: textOf(record['description']) ?? '',
      options: listOf(record['options']).map(option => {
        const fields = isRecord(option) ? option : {}
        return {
          label: textOf(fields['label']) ?? '',
          description: textOf(fields['description']) ?? '',
        }
      }),
    }
  })
}

function terminalLabel(entry: HistoryEntry): string {
  const payload = isRecord(entry.payload) ? entry.payload : {}
  const terminal = isRecord(payload['terminal']) ? payload['terminal'] : {}
  switch (textOf(terminal['outcome'])) {
    case 'completed':
      return '这一轮已完成'
    case 'failed':
      return '这一轮失败了'
    case 'cancelled':
      return '这一轮已取消'
    default:
      return '这一轮已结束'
  }
}

/**
 * Builds the items. Tool calls and their results pair by call id only, never by position; the
 * first result for a call is its result. A tool message whose results all paired is not drawn on
 * its own. An Ask call is a question card whose status comes from the conversation itself.
 */
export function conversationItems(content: Content, runActive: boolean): readonly Item[] {
  const items: Item[] = []
  const results = new Map<string, ToolResultView>()
  const toolParts = new Map<string, Part[]>()
  // Collect every result first: a call is answered by a later tool message.
  for (const entry of content.entries) {
    const message = entry.kind === 'message.tool' ? messageOf(entry) : null
    if (message === null) continue
    const parts = messageParts(message.blocks, entry.entryId)
    toolParts.set(entry.entryId, parts)
    for (const part of parts)
      if (part.kind === 'tool-result' && !results.has(part.callId))
        results.set(part.callId, part.result)
  }
  const callIds = new Set<string>()
  // Which calls are followed by the end of a run: an Ask without a result there has expired.
  const endedCalls = new Set<string>()
  const openCalls: string[] = []

  const withResults = (parts: readonly Part[]): Part[] =>
    parts.map(part => {
      if (part.kind !== 'tool-call') return part
      if (part.callId !== null) {
        callIds.add(part.callId)
        openCalls.push(part.callId)
      }
      const result = part.callId === null ? null : (results.get(part.callId) ?? null)
      const questions = part.name === ASK_TOOL ? askQuestions(part.arguments) : null
      return {
        ...part,
        result,
        ask:
          questions === null
            ? null
            : { questions, status: result === null ? 'waiting' : 'answered' },
      }
    })

  for (const entry of content.entries) {
    switch (entry.kind) {
      case 'message.user':
      case 'message.assistant': {
        const message = messageOf(entry)
        if (message === null) {
          items.push({ kind: 'unknown', key: entry.entryId, entryKind: entry.kind })
          break
        }
        items.push({
          kind: 'message',
          key: entry.entryId,
          role: entry.kind === 'message.user' ? 'user' : 'assistant',
          parts: withResults(messageParts(message.blocks, entry.entryId)),
          live: false,
        })
        break
      }
      case 'message.tool': {
        const parts = toolParts.get(entry.entryId) ?? []
        const unpaired = parts.filter(
          part =>
            part.kind !== 'tool-result' ||
            !callIds.has(part.callId) ||
            results.get(part.callId) !== part.result,
        )
        if (unpaired.length > 0)
          items.push({
            kind: 'message',
            key: entry.entryId,
            role: 'tool',
            parts: unpaired,
            live: false,
          })
        break
      }
      case 'message.tool_internal':
      case 'message.system_reminder': {
        const message = messageOf(entry)
        items.push({
          kind: 'note',
          key: entry.entryId,
          label: entry.kind === 'message.system_reminder' ? '系统提醒' : '内部工具消息',
          parts: message === null ? [] : withResults(messageParts(message.blocks, entry.entryId)),
        })
        break
      }
      case 'message.compaction':
        items.push({ kind: 'marker', key: entry.entryId, label: '前面的对话已压缩' })
        break
      case 'run.started':
        items.push({ kind: 'marker', key: entry.entryId, label: '新的一轮开始' })
        break
      case 'run.terminal':
        for (const callId of openCalls.splice(0)) endedCalls.add(callId)
        items.push({ kind: 'marker', key: entry.entryId, label: terminalLabel(entry) })
        break
      default:
        items.push({ kind: 'unknown', key: entry.entryId, entryKind: entry.kind })
    }
  }

  if (content.live !== null)
    items.push({
      kind: 'message',
      key: 'live',
      role: 'assistant',
      parts: withResults(liveParts(content.live.blocks)),
      live: true,
    })

  return items.map(item => expireAsks(item, endedCalls, runActive))
}

function expireAsks(item: Item, ended: ReadonlySet<string>, runActive: boolean): Item {
  if (item.kind !== 'message' && item.kind !== 'note') return item
  let changed = false
  const parts = item.parts.map(part => {
    if (part.kind !== 'tool-call' || part.ask === null || part.ask.status !== 'waiting') return part
    if (!runActive || (part.callId !== null && ended.has(part.callId))) {
      changed = true
      return { ...part, ask: { ...part.ask, status: 'expired' as const } }
    }
    return part
  })
  return changed ? { ...item, parts } : item
}
