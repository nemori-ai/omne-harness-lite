import { judgePart } from '@omne-harness/message'
import type { VisibleBlock } from './call-surface.ts'
import { checkStreamBlocks } from './model-stream-values-blocks.ts'
import type { ModelBlock } from './result.ts'

export function outputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function outputFields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key))
}

function select(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) result[key] = value[key]
  return result
}

const BLOCK_FIELDS: Readonly<Record<ModelBlock['kind'], readonly string[]>> = {
  text: ['text'],
  thinking: ['text'],
  voice: ['mediaType', 'inline'],
  image: ['mediaType', 'inline'],
  file: ['storage', 'key', 'mediaType'],
  tool_call: ['callId', 'name', 'arguments'],
  reasoning_state: ['payload', 'pairs'],
}

function isModelBlockKind(kind: unknown): kind is ModelBlock['kind'] {
  return typeof kind === 'string' && Object.hasOwn(BLOCK_FIELDS, kind)
}

function publicBlock(value: Record<string, unknown>): Record<string, unknown> | null {
  const kind = value.kind
  if (!isModelBlockKind(kind)) return null
  const referenced = 'ref' in value && (kind === 'voice' || kind === 'image' || kind === 'file')
  const fields = referenced ? ['ref', 'transcript'] : BLOCK_FIELDS[kind]
  return select(value, ['kind', 'id', 'visibility', ...fields])
}

function growing(value: Record<string, unknown>): VisibleBlock | null {
  if (
    typeof value.index !== 'string' ||
    (value.mode !== 'append' && value.mode !== 'replace') ||
    (value.content !== 'text' &&
      value.content !== 'thinking' &&
      value.content !== 'tool-arguments' &&
      value.content !== 'voice') ||
    typeof value.value !== 'string'
  )
    return null
  return {
    kind: 'growing',
    index: value.index,
    mode: value.mode,
    content: value.content,
    value: value.value,
  }
}

function sealed(
  value: Record<string, unknown>,
  encoding: boolean,
): VisibleBlock | null | 'unknown' {
  if (!encoding && !outputFields(value, ['kind', 'index', 'block'])) return null
  if (typeof value.index !== 'string' || !outputRecord(value.block)) return null
  const selected = publicBlock(value.block)
  if (selected === null) return typeof value.block.kind === 'string' ? 'unknown' : null
  const block = judgePart(encoding ? selected : value.block)
  if ('rejected' in block) return null
  switch (block.ok.kind) {
    case 'tool_call_incomplete':
    case 'tool_call_unparsed':
    case 'tool_result':
      return null
    default:
      return { kind: 'sealed', index: value.index, block: block.ok }
  }
}

function visible(
  value: Record<string, unknown>,
  encoding: boolean,
): VisibleBlock | null | 'unknown' {
  if (value.kind === 'sealed') return sealed(value, encoding)
  if (value.kind !== 'growing') return typeof value.kind === 'string' ? 'unknown' : null
  if (!encoding && !outputFields(value, ['kind', 'index', 'mode', 'content', 'value'])) return null
  return growing(value)
}

/** Unknown kinds are omitted only at the producer boundary; wire input rejects them. */
export function outputBlocks(value: unknown, encoding: boolean): readonly VisibleBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks: VisibleBlock[] = []
  for (const item of value) {
    if (!outputRecord(item)) return null
    const block = visible(item, encoding)
    if (block === 'unknown' && encoding) continue
    if (block === null || block === 'unknown') return null
    blocks.push(block)
  }
  return checkStreamBlocks([], blocks, []) === null ? blocks : null
}
