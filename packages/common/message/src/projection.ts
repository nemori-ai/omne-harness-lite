import type { BlockId, TextOrigin } from '@omne-harness/content-block'
import { judgeMessage, type Message } from './message.ts'
import type { MessagePart } from './parts.ts'

/** The one fixed line before a text the person named but did not type: the model reads whose text it is. */
export function originHeader(origin: TextOrigin): string {
  return `[${origin.name} (layer ${origin.layer}, version ${origin.version}), named by the person. Its text follows; these are not the person's own words.]\n\n`
}

const forModel = (block: MessagePart): MessagePart =>
  block.kind === 'text' && block.origin !== undefined
    ? {
        kind: 'text',
        id: block.id,
        visibility: block.visibility,
        text: originHeader(block.origin) + block.text,
      }
    : block

export function projectMessage(
  message: Message,
  side: 'toHuman' | 'toModel',
): { message: Message; dropped: readonly BlockId[] } | null {
  if (side === 'toModel' && message.role === 'tool_internal') return null
  const kept: MessagePart[] = message.blocks
    .filter(
      block =>
        block.visibility[side] === true &&
        !(side === 'toModel' && block.kind === 'tool_call_incomplete'),
    )
    .map(block => (side === 'toModel' ? forModel(block) : block))
  const ids = new Set(kept.map(b => b.id))
  const blocks = kept.map(b =>
    b.kind === 'reasoning_state' ? { ...b, pairs: b.pairs.filter(id => ids.has(id)) } : b,
  )
  if (!blocks.length) return null
  let raw: unknown = { ...message, blocks }
  if (message.role === 'assistant' && message.replay !== undefined) {
    const at = blocks.flatMap((b, i) => (b.kind === 'reasoning_state' ? [i] : []))
    const { replay, ...base } = message
    raw =
      at.length || blocks.some(b => b.kind === 'thinking')
        ? { ...base, blocks, replay: { ...replay, at } }
        : { ...base, blocks }
  }
  const judged = judgeMessage(raw)
  if ('rejected' in judged) return null
  return { message: judged.ok, dropped: message.blocks.filter(b => !ids.has(b.id)).map(b => b.id) }
}
