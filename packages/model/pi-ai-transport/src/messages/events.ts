import type { JsonValue } from '@omne-harness/json-text'

/** One stream event of the Messages interface, read into what the decoder needs. */
export type MessagesEvent =
  | Readonly<{ type: 'message_start'; model: string | null; provider: string | null; usage: Usage }>
  | Readonly<{ type: 'content_block_start'; index: number; block: StartedBlock }>
  | Readonly<{ type: 'content_block_delta'; index: number; delta: BlockDelta }>
  | Readonly<{ type: 'content_block_stop'; index: number }>
  | Readonly<{ type: 'message_delta'; stopReason: string | null; usage: Usage }>
  | Readonly<{ type: 'message_stop' }>
  | Readonly<{ type: 'ping' }>
  | Readonly<{ type: 'error'; errorType: string | null }>

export type StartedBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'thinking'; thinking: string; signature: string }>
  | Readonly<{ type: 'redacted_thinking'; data: string }>
  | Readonly<{ type: 'tool_use'; id: string; name: string }>

export type BlockDelta =
  | Readonly<{ type: 'text_delta'; text: string }>
  | Readonly<{ type: 'thinking_delta'; thinking: string }>
  | Readonly<{ type: 'signature_delta'; signature: string }>
  | Readonly<{ type: 'input_json_delta'; partialJson: string }>

/** The usage members an event carried, as decimal lexemes, and the transformations it reported. */
export type Usage = Readonly<{
  input: string | null
  output: string | null
  cacheRead: string | null
  cacheWrite: string | null
  thinking: string | null
  cost: string | null
  transformations: readonly Transformation[]
}>

export type Transformation = Readonly<{ type: string; path: string; reason: string }>

export type EventRead = Readonly<{ ok: MessagesEvent }> | Readonly<{ failure: string }>

type Members = ReadonlyMap<string, JsonValue>

const DECIMAL = /^(0|[1-9][0-9]*)$/
const NUMBER = /^(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/

function membersOf(value: JsonValue | undefined): Members | null {
  return value?.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : null
}

function textOf(members: Members, key: string): string | null {
  const value = members.get(key)
  return value?.kind === 'string' ? value.value : null
}

function indexOf(members: Members): number | null {
  const value = members.get('index')
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? Number(value.lexeme) : null
}

function countOf(members: Members | null, key: string): string | null {
  const value = members?.get(key)
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

function transformationsOf(value: JsonValue | undefined): readonly Transformation[] {
  if (value?.kind !== 'array') return []
  return value.items.flatMap(item => {
    const members = membersOf(item)
    if (members === null) return []
    const type = textOf(members, 'type')
    const path = textOf(members, 'path')
    const reason = textOf(members, 'reason')
    return type === null || path === null || reason === null ? [] : [{ type, path, reason }]
  })
}

function usageOf(usage: Members | null, holder: Members): Usage {
  const cost = usage?.get('cost')
  return {
    input: countOf(usage, 'input_tokens'),
    output: countOf(usage, 'output_tokens'),
    cacheRead: countOf(usage, 'cache_read_input_tokens'),
    cacheWrite: countOf(usage, 'cache_creation_input_tokens'),
    thinking: countOf(membersOf(usage?.get('output_tokens_details')), 'thinking_tokens'),
    cost: cost?.kind === 'number' && NUMBER.test(cost.lexeme) ? cost.lexeme : null,
    transformations: transformationsOf(holder.get('input_transformations')),
  }
}

function startedOf(members: Members | null): StartedBlock | null {
  if (members === null) return null
  switch (textOf(members, 'type')) {
    case 'text': {
      const text = textOf(members, 'text')
      return text === null ? null : { type: 'text', text }
    }
    case 'thinking': {
      const thinking = textOf(members, 'thinking')
      return thinking === null
        ? null
        : { type: 'thinking', thinking, signature: textOf(members, 'signature') ?? '' }
    }
    case 'redacted_thinking': {
      const data = textOf(members, 'data')
      return data === null ? null : { type: 'redacted_thinking', data }
    }
    case 'tool_use': {
      const id = textOf(members, 'id')
      const name = textOf(members, 'name')
      return id === null || name === null ? null : { type: 'tool_use', id, name }
    }
    default:
      return null
  }
}

function deltaOf(members: Members | null): BlockDelta | null {
  if (members === null) return null
  const field = (type: BlockDelta['type'], key: string): string | null =>
    textOf(members, 'type') === type ? textOf(members, key) : null
  const text = field('text_delta', 'text')
  if (text !== null) return { type: 'text_delta', text }
  const thinking = field('thinking_delta', 'thinking')
  if (thinking !== null) return { type: 'thinking_delta', thinking }
  const signature = field('signature_delta', 'signature')
  if (signature !== null) return { type: 'signature_delta', signature }
  const partialJson = field('input_json_delta', 'partial_json')
  return partialJson === null ? null : { type: 'input_json_delta', partialJson }
}

function indexed(members: Members, read: (index: number) => EventRead): EventRead {
  const index = indexOf(members)
  return index === null ? { failure: 'event-without-index' } : read(index)
}

/** Reads one data frame; an event this engine cannot read is a protocol failure, never skipped. */
export function readEvent(value: JsonValue): EventRead {
  const members = membersOf(value)
  if (members === null) return { failure: 'event-not-object' }
  switch (textOf(members, 'type')) {
    case 'message_start': {
      const message = membersOf(members.get('message'))
      if (message === null) return { failure: 'message-start-without-message' }
      return {
        ok: {
          type: 'message_start',
          model: textOf(message, 'model'),
          provider: textOf(message, 'provider'),
          usage: usageOf(membersOf(message.get('usage')), message),
        },
      }
    }
    case 'content_block_start':
      return indexed(members, index => {
        const block = startedOf(membersOf(members.get('content_block')))
        return block === null
          ? { failure: 'unsupported-block' }
          : { ok: { type: 'content_block_start', index, block } }
      })
    case 'content_block_delta':
      return indexed(members, index => {
        const delta = deltaOf(membersOf(members.get('delta')))
        return delta === null
          ? { failure: 'unsupported-delta' }
          : { ok: { type: 'content_block_delta', index, delta } }
      })
    case 'content_block_stop':
      return indexed(members, index => ({ ok: { type: 'content_block_stop', index } }))
    case 'message_delta': {
      const delta = membersOf(members.get('delta'))
      return {
        ok: {
          type: 'message_delta',
          stopReason: delta === null ? null : textOf(delta, 'stop_reason'),
          usage: usageOf(membersOf(members.get('usage')), members),
        },
      }
    }
    case 'message_stop':
      return { ok: { type: 'message_stop' } }
    case 'ping':
      return { ok: { type: 'ping' } }
    case 'error': {
      const error = membersOf(members.get('error'))
      return { ok: { type: 'error', errorType: error === null ? null : textOf(error, 'type') } }
    }
    default:
      return { failure: 'unsupported-event' }
  }
}
