import { isStandardBase64, reduceFills } from '@omne-harness-lite/arrival-events'
import type { FillEvent, OpenEvent } from '@omne-harness-lite/arrival-events'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import { incompleteToolCall } from './close.ts'
import type { BlockRecord, OpenRecord } from './state.ts'
import type { OpenedBlock, ReducedContent, SnapshotBlock } from './types.ts'

export function contentOf(record: OpenRecord): ReducedContent | undefined {
  const fills: FillEvent['payload'][] = []
  for (let fragment = record.fills; fragment !== undefined; fragment = fragment.previous)
    fills.push(fragment.payload)
  fills.reverse()
  return reduceFills(record.opened, fills)
}

export function fillMatches(opened: OpenEvent, payload: FillEvent['payload']): boolean {
  if (opened.fill === 'replace') return true // AR's contextual replace_payload_shape has already checked this.
  return (
    typeof payload === 'string' &&
    payload.length > 0 &&
    (opened.kind !== 'voice' || isStandardBase64(payload))
  )
}

export function closeMatches(opened: OpenEvent, block: ContentBlock | undefined): boolean {
  if (opened.kind === 'tool_call') return block === undefined
  return (
    block !== undefined &&
    block.kind === opened.kind &&
    block.id === opened.id &&
    block.visibility.toHuman === opened.visibility.toHuman &&
    block.visibility.toModel === opened.visibility.toModel &&
    (!('mediaType' in block) || block.mediaType === opened.head?.mediaType)
  )
}

export function closeContributesContent(block: ContentBlock): boolean {
  if (block.kind === 'tool_call') return false
  return (block.kind !== 'text' && block.kind !== 'thinking') || block.text.length > 0
}

function openedView(opened: OpenEvent): OpenedBlock {
  const { t: _event, index: _index, ...facts } = opened
  return Object.freeze(facts)
}

export function snapshotBlock(record: BlockRecord): SnapshotBlock {
  if (record.closed)
    return Object.freeze({ index: record.opened.index, closed: true, block: record.block })
  const content = contentOf(record)
  return Object.freeze({
    index: record.opened.index,
    closed: false,
    opened: openedView(record.opened),
    ...(content === undefined ? {} : { content }),
  })
}

function constructedBlock(value: unknown): ContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged)
    throw new Error(`derived open block violates its invariant: ${judged.rejected}`)
  return judged.ok
}

const wholeBlockKinds: readonly OpenEvent['kind'][] = Object.freeze([
  'image',
  'file',
  'tool_result',
])

export function settleBlock(record: BlockRecord): ContentBlock | undefined {
  if (record.closed) return record.block
  const opened = record.opened
  const content = contentOf(record)
  if (opened.kind === 'tool_call') {
    if (content !== undefined && typeof content !== 'string')
      throw new Error('tool arguments reduction invariant')
    return incompleteToolCall(opened, content ?? '')
  }
  if (content === undefined) return undefined
  if (wholeBlockKinds.includes(opened.kind)) {
    if (typeof content === 'string') throw new Error('whole block reduction invariant')
    return content
  }
  if (typeof content !== 'string') throw new Error('scalar block reduction invariant')
  const identity = { id: opened.id, visibility: opened.visibility }
  if (opened.kind === 'voice')
    return constructedBlock({
      ...identity,
      kind: 'voice',
      mediaType: opened.head.mediaType,
      data: { inline: content },
    })
  return constructedBlock({ ...identity, kind: opened.kind, text: content })
}
