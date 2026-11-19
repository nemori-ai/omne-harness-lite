import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ThinkingBlock } from './vocabulary.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })

/** The interface form of one thinking block, with its members in key order. */
export function thinkingJson(block: ThinkingBlock): JsonValue {
  return block.type === 'thinking'
    ? {
        kind: 'object',
        entries: [
          { key: 'signature', value: text(block.signature) },
          { key: 'thinking', value: text(block.thinking) },
          { key: 'type', value: text('thinking') },
        ],
      }
    : {
        kind: 'object',
        entries: [
          { key: 'data', value: text(block.data) },
          { key: 'type', value: text('redacted_thinking') },
        ],
      }
}

/** The payload of a reasoning state: the thinking blocks of one reply, in order. */
export function sealThinking(blocks: readonly ThinkingBlock[]): string {
  return writeJsonText({ kind: 'array', items: blocks.map(thinkingJson) })
}

function member(entries: readonly Readonly<{ key: string; value: JsonValue }>[], key: string) {
  const value = entries.find(entry => entry.key === key)?.value
  return value?.kind === 'string' ? value.value : null
}

function blockOf(value: JsonValue): ThinkingBlock | null {
  if (value.kind !== 'object') return null
  const type = member(value.entries, 'type')
  if (type === 'thinking') {
    const thinking = member(value.entries, 'thinking')
    const signature = member(value.entries, 'signature')
    return thinking === null || signature === null || signature === ''
      ? null
      : { type, thinking, signature }
  }
  if (type === 'redacted_thinking') {
    const data = member(value.entries, 'data')
    return data === null || data === '' ? null : { type, data }
  }
  return null
}

/** The thinking blocks of a payload, or null when it is not one this engine sealed. */
export function readThinking(payload: string): readonly ThinkingBlock[] | null {
  const bound = Math.max(1, payload.length)
  const read = readJsonText(payload, {
    maxBytes: bound * 4,
    maxDepth: 3,
    maxItems: bound,
    maxMembers: 3,
    maxStringLength: bound,
    maxNumberLength: 1,
  })
  if (read.kind !== 'ok' || read.value.kind !== 'array' || read.value.items.length === 0)
    return null
  const blocks: ThinkingBlock[] = []
  for (const item of read.value.items) {
    const block = blockOf(item)
    if (block === null) return null
    blocks.push(block)
  }
  return blocks
}
