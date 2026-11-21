import { terminalOf, type Content, type HistoryEntry, type LiveBlock } from './content.ts'
import { isRecord, listOf, plainOfTree, textOf, type Plain } from './plain.ts'

export type ToolResultView = Readonly<{ parts: readonly Part[] }>

export type Part =
  | Readonly<{ kind: 'text'; key: string; text: string }>
  | Readonly<{ kind: 'thinking'; key: string; text: string }>
  | Readonly<{
      kind: 'tool-call'
      key: string
      callId: string | null
      name: string | null
      arguments: Plain
      raw: string | null
      state: 'complete' | 'incomplete' | 'unparsed' | 'generating'
      result: ToolResultView | null
      ended: boolean
    }>
  | Readonly<{ kind: 'tool-result'; key: string; callId: string; result: ToolResultView }>
  | Readonly<{
      kind: 'media'
      key: string
      media: string
      detail: string
      source: BlockSource | null
    }>
  | Readonly<{ kind: 'unknown'; key: string; partKind: string }>

export type Item =
  | Readonly<{
      kind: 'message'
      key: string
      role: 'user' | 'assistant' | 'tool'
      parts: readonly Part[]
      live: boolean
    }>
  | Readonly<{ kind: 'note'; key: string; label: string; parts: readonly Part[] }>
  | Readonly<{ kind: 'marker'; key: string; label: string; failedRun: string | null }>
  | Readonly<{ kind: 'unknown'; key: string; entryKind: string }>

type Block = { readonly [key: string]: Plain }
type PartFrom = (block: Block, key: string, kind: string, message: string | null) => Part

/** Where a block that is not words stands: its message, its own id, and the block as read. */
export type BlockSource = Readonly<{ message: string; block: string; content: Plain }>

function mediaTypeOf(block: Block): string | undefined {
  const ref = block['ref']
  return textOf(block['mediaType']) ?? (isRecord(ref) ? textOf(ref['mediaType']) : undefined)
}

const media: PartFrom = (block, key, kind, message) => {
  const id = textOf(block['id'])
  return {
    kind: 'media',
    key,
    media: kind,
    detail: textOf(block['transcript']) ?? mediaTypeOf(block) ?? '',
    source: message === null || id === undefined ? null : { message, block: id, content: block },
  }
}

const PART: ReadonlyMap<string, PartFrom> = new Map<string, PartFrom>([
  ['text', (block, key) => ({ kind: 'text', key, text: textOf(block['text']) ?? '' })],
  ['thinking', (block, key) => ({ kind: 'thinking', key, text: textOf(block['text']) ?? '' })],
  ['image', media],
  ['file', media],
  ['voice', media],
  ['tool_call', (block, key) => toolCall(key, block, 'complete')],
  ['tool_call_incomplete', (block, key) => toolCall(key, block, 'incomplete')],
  ['tool_call_unparsed', (block, key) => toolCall(key, block, 'unparsed')],
])

function contentPart(block: Plain, key: string, message: string | null = null): Part {
  if (!isRecord(block)) return { kind: 'unknown', key, partKind: typeof block }
  const kind = textOf(block['kind']) ?? '(none)'
  const build = PART.get(kind)
  return build === undefined
    ? { kind: 'unknown', key, partKind: kind }
    : build(block, key, kind, message)
}

function toolCall(key: string, block: Block, state: 'complete' | 'incomplete' | 'unparsed'): Part {
  const raw = textOf(block['partial']) ?? textOf(block['raw']) ?? null
  return {
    kind: 'tool-call',
    key,
    callId: textOf(block['callId']) ?? null,
    name: textOf(block['name']) ?? null,
    arguments: state === 'complete' ? argumentsOf(block['arguments'] ?? null) : null,
    raw,
    state,
    result: null,
    ended: false,
  }
}

function argumentsOf(value: Plain): Plain {
  return plainOfTree(value) ?? value
}

function messageParts({ blocks, id }: MessageRead, prefix: string): Part[] {
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
    const part = contentPart(block, key, id)
    if (body !== null && part.kind !== 'tool-call') body.push(part)
    else parts.push(part)
  })
  return parts
}

type MessageRead = Readonly<{ role: string; id: string | null; blocks: readonly Plain[] }>

function messageOf(entry: HistoryEntry): MessageRead | null {
  const payload = entry.payload
  const message = isRecord(payload) ? payload['message'] : undefined
  if (!isRecord(message)) return null
  return {
    role: textOf(message['role']) ?? '',
    id: textOf(message['id']) ?? null,
    blocks: listOf(message['blocks']),
  }
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
            ended: false,
          },
        ]
      case 'voice':
        return [{ kind: 'media', key, media: 'voice', detail: '', source: null }]
      default:
        return [{ kind: 'unknown', key, partKind: block.content }]
    }
  })
}

const TERMINAL: Readonly<Record<string, string>> = {
  completed: '这一轮已完成',
  failed: '这一轮失败了',
  cancelled: '这一轮已取消',
}

function terminalMarker(entry: HistoryEntry): Item {
  const terminal = terminalOf(entry)
  const outcome = terminal?.outcome ?? ''
  return {
    kind: 'marker',
    key: entry.entryId,
    label: TERMINAL[outcome] ?? '这一轮已结束',
    failedRun: outcome === 'failed' ? (terminal?.run ?? null) : null,
  }
}

type Walk = {
  readonly results: Map<string, ToolResultView>
  readonly toolParts: Map<string, Part[]>
  readonly callIds: Set<string>
  readonly endedCalls: Set<string>
  readonly openCalls: string[]
}

function walkOf(entries: readonly HistoryEntry[]): Walk {
  const walk: Walk = {
    results: new Map(),
    toolParts: new Map(),
    callIds: new Set(),
    endedCalls: new Set(),
    openCalls: [],
  }
  for (const entry of entries) {
    const message = entry.kind === 'message.tool' ? messageOf(entry) : null
    if (message === null) continue
    const parts = messageParts(message, entry.entryId)
    walk.toolParts.set(entry.entryId, parts)
    for (const part of parts)
      if (part.kind === 'tool-result' && !walk.results.has(part.callId))
        walk.results.set(part.callId, part.result)
  }
  return walk
}

function linkCall(walk: Walk, part: Part): Part {
  if (part.kind !== 'tool-call') return part
  if (part.callId !== null) {
    walk.callIds.add(part.callId)
    walk.openCalls.push(part.callId)
  }
  const result = part.callId === null ? null : (walk.results.get(part.callId) ?? null)
  return { ...part, result }
}

const withResults = (walk: Walk, parts: readonly Part[]): Part[] =>
  parts.map(part => linkCall(walk, part))

type ItemFrom = (walk: Walk, entry: HistoryEntry) => Item | null

const unknownItem: ItemFrom = (_walk, entry) => ({
  kind: 'unknown',
  key: entry.entryId,
  entryKind: entry.kind,
})

const chatItem: ItemFrom = (walk, entry) => {
  const message = messageOf(entry)
  if (message === null) return unknownItem(walk, entry)
  return {
    kind: 'message',
    key: entry.entryId,
    role: entry.kind === 'message.user' ? 'user' : 'assistant',
    parts: withResults(walk, messageParts(message, entry.entryId)),
    live: false,
  }
}

const toolItem: ItemFrom = (walk, entry) => {
  const unpaired = (walk.toolParts.get(entry.entryId) ?? []).filter(
    part =>
      part.kind !== 'tool-result' ||
      !walk.callIds.has(part.callId) ||
      walk.results.get(part.callId) !== part.result,
  )
  if (unpaired.length === 0) return null
  return { kind: 'message', key: entry.entryId, role: 'tool', parts: unpaired, live: false }
}

const noteItem: ItemFrom = (walk, entry) => {
  const message = messageOf(entry)
  return {
    kind: 'note',
    key: entry.entryId,
    label: entry.kind === 'message.system_reminder' ? '系统提醒' : '内部工具消息',
    parts: message === null ? [] : withResults(walk, messageParts(message, entry.entryId)),
  }
}

const markerItem =
  (label: string): ItemFrom =>
  (_walk, entry) => ({ kind: 'marker', key: entry.entryId, label, failedRun: null })

const terminalItem: ItemFrom = (walk, entry) => {
  for (const callId of walk.openCalls.splice(0)) walk.endedCalls.add(callId)
  return terminalMarker(entry)
}

const ENTRY_ITEM: ReadonlyMap<string, ItemFrom> = new Map([
  ['message.user', chatItem],
  ['message.assistant', chatItem],
  ['message.tool', toolItem],
  ['message.tool_internal', noteItem],
  ['message.system_reminder', noteItem],
  ['message.compaction', markerItem('前面的对话已压缩')],
  ['run.started', markerItem('新的一轮开始')],
  ['run.terminal', terminalItem],
])

export function conversationItems(content: Content, runActive: boolean): readonly Item[] {
  const walk = walkOf(content.entries)
  const items: Item[] = []
  for (const entry of content.entries) {
    const item = (ENTRY_ITEM.get(entry.kind) ?? unknownItem)(walk, entry)
    if (item !== null) items.push(item)
  }
  if (content.live !== null)
    items.push({
      kind: 'message',
      key: 'live',
      role: 'assistant',
      parts: withResults(walk, liveParts(content.live.blocks)),
      live: true,
    })
  return items.map(item => endCalls(item, walk.endedCalls, runActive))
}

function endCalls(item: Item, ended: ReadonlySet<string>, runActive: boolean): Item {
  if (item.kind !== 'message' && item.kind !== 'note') return item
  let changed = false
  const parts = item.parts.map(part => {
    if (part.kind !== 'tool-call' || part.result !== null || part.ended) return part
    if (!runActive || (part.callId !== null && ended.has(part.callId))) {
      changed = true
      return { ...part, ended: true }
    }
    return part
  })
  return changed ? { ...item, parts } : item
}
