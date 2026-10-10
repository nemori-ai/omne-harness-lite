import { z } from 'zod'
import { writeJsonLossless, type ContentBlock } from '@omne-harness-lite/content-blocks'
import type { ModelInvocationHandle } from '@omne-harness-lite/model-request-runtime'
type ModelSnapshot = ReturnType<ModelInvocationHandle['snapshot']>

export interface ToolObservation {
  readonly state: string
  readonly blocks: readonly HumanBlock[]
  readonly notice: string | null
  readonly offloaded: boolean
}
export type HumanBlock =
  | { readonly id: string; readonly kind: 'text' | 'thinking'; readonly text: string }
  | {
      readonly id: string
      readonly kind: 'tool_call'
      readonly call: string | null
      readonly tool: string
      readonly arguments: {
        readonly encoding: 'json' | 'partial' | 'unparseable'
        readonly text: string
      }
      readonly observation: ToolObservation | null
    }
  | {
      readonly id: string
      readonly kind: 'tool_result'
      readonly call: string
      readonly outcome: string
      readonly reason: string | null
      readonly blocks: readonly HumanBlock[]
      readonly offloaded: boolean
    }
  | {
      readonly id: string
      readonly kind: 'attachment'
      readonly media: 'image' | 'voice' | 'file'
      readonly name: string | null
    }

const identity = { id: z.string().min(1) }
export const humanBlockSchema: z.ZodType<HumanBlock> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ ...identity, kind: z.literal('text'), text: z.string() }),
    z.strictObject({ ...identity, kind: z.literal('thinking'), text: z.string() }),
    z.strictObject({
      ...identity,
      kind: z.literal('tool_call'),
      call: z.string().min(1).nullable(),
      tool: z.string(),
      arguments: z.strictObject({
        encoding: z.enum(['json', 'partial', 'unparseable']),
        text: z.string(),
      }),
      observation: toolObservationSchema.nullable(),
    }),
    z.strictObject({
      ...identity,
      kind: z.literal('tool_result'),
      call: z.string().min(1),
      outcome: z.string(),
      reason: z.string().nullable(),
      blocks: z.array(humanBlockSchema),
      offloaded: z.boolean(),
    }),
    z.strictObject({
      ...identity,
      kind: z.literal('attachment'),
      media: z.enum(['image', 'voice', 'file']),
      name: z.string().nullable(),
    }),
  ]),
)
export const toolObservationSchema: z.ZodType<ToolObservation> = z.lazy(() =>
  z.strictObject({
    state: z.string(),
    blocks: z.array(humanBlockSchema),
    notice: z.string().nullable(),
    offloaded: z.boolean(),
  }),
)

/** Explicit visible fields only; a hidden ancestor suppresses its entire subtree. */
export function humanBlocks(roots: readonly ContentBlock[]): HumanBlock[] {
  const result: HumanBlock[] = []
  const pending = roots.map(block => ({ block, target: result })).reverse()
  while (pending.length) {
    const current = pending.pop()!
    if (!current.block.visibility.toHuman) continue
    const projected = humanBlock(current.block)
    if (!projected) continue
    current.target.push(projected)
    if (current.block.kind === 'tool_result' && projected.kind === 'tool_result') {
      const children: HumanBlock[] = []
      current.target[current.target.length - 1] = { ...projected, blocks: children }
      for (const block of [...current.block.blocks].reverse())
        pending.push({ block, target: children })
    }
  }
  return result
}
function humanBlock(block: ContentBlock): HumanBlock | undefined {
  const id = block.id
  switch (block.kind) {
    case 'text':
    case 'thinking':
      return { id, kind: block.kind, text: block.text }
    case 'tool_call':
      return humanToolCall(block)
    case 'tool_result':
      return {
        id,
        kind: 'tool_result',
        call: block.callId,
        outcome: block.outcome,
        reason: resultReason(block),
        blocks: [],
        offloaded: block.offloaded !== undefined,
      }
    case 'file':
      return { id, kind: 'attachment', media: 'file', name: block.attachment.name ?? null }
    case 'image':
    case 'voice':
      return {
        id,
        kind: 'attachment',
        media: block.kind,
        name: 'name' in block.data ? (block.data.name ?? null) : null,
      }
  }
}
function resultReason(block: Extract<ContentBlock, { kind: 'tool_result' }>): string | null {
  if (!block.reason) return null
  if ('text' in block.reason) return `${block.reason.code}: ${block.reason.text}`
  return block.reason.kind === 'admission'
    ? `${block.reason.code}: ${block.reason.conclusion}`
    : `${block.reason.kind}: ${block.reason.conclusion}: ${block.reason.explanation}`
}
/** A snapshot replaces cumulative text. It is never interpreted as a delta. */
export function humanSnapshot(snapshot: ModelSnapshot): HumanBlock[] {
  return snapshot.blocks.flatMap(value => {
    if (value.closed) return humanBlocks([value.block])
    const block = value.opened
    if (!block.visibility.toHuman) return []
    switch (block.kind) {
      case 'text':
      case 'thinking':
        return [
          {
            id: block.id,
            kind: block.kind,
            text: typeof value.content === 'string' ? value.content : '',
          } satisfies HumanBlock,
        ]
      case 'tool_call':
        return [
          {
            id: block.id,
            kind: 'tool_call',
            call: block.head.callId ?? null,
            tool: block.head.tool ?? '',
            arguments: {
              encoding: 'partial',
              text: typeof value.content === 'string' ? value.content : '',
            },
            observation: null,
          } satisfies HumanBlock,
        ]
      default:
        return []
    }
  })
}

/** All nested display fields consume the same budget, including arguments and results. */
export function boundHumanBlocks(
  roots: readonly HumanBlock[],
  characters: number,
  count = Number.MAX_SAFE_INTEGER,
) {
  let remaining = characters,
    nodes = count,
    omitted = false
  function text(value: string): string {
    const retained = value.slice(0, remaining)
    remaining -= retained.length
    omitted ||= retained.length !== value.length
    return retained
  }
  function blocks(values: readonly HumanBlock[]): HumanBlock[] {
    const result: HumanBlock[] = []
    for (const value of values) {
      if (nodes-- <= 0 || remaining <= 0) {
        omitted = true
        break
      }
      const fixed = fixedCharacters(value)
      if (fixed > remaining) {
        omitted = true
        continue
      }
      remaining -= fixed
      result.push(boundBlock(value, text, blocks))
    }
    return result
  }
  const items = blocks(roots)
  return { items, omitted }
}

function fixedCharacters(value: HumanBlock): number {
  if (value.kind === 'tool_result')
    return value.id.length + value.call.length + value.outcome.length
  if (value.kind === 'tool_call')
    return value.id.length + (value.call?.length ?? 0) + (value.observation?.state.length ?? 0)
  return value.id.length
}
function boundBlock(
  value: HumanBlock,
  text: (value: string) => string,
  blocks: (value: readonly HumanBlock[]) => HumanBlock[],
): HumanBlock {
  const optionalText = (value: string | null) => (value === null ? null : text(value))
  switch (value.kind) {
    case 'text':
    case 'thinking':
      return { ...value, text: text(value.text) }
    case 'attachment':
      return { ...value, name: optionalText(value.name) }
    case 'tool_result':
      return { ...value, reason: optionalText(value.reason), blocks: blocks(value.blocks) }
    case 'tool_call':
      return {
        ...value,
        tool: text(value.tool),
        arguments: { ...value.arguments, text: text(value.arguments.text) },
        observation:
          value.observation === null
            ? null
            : {
                ...value.observation,
                notice: optionalText(value.observation.notice),
                blocks: blocks(value.observation.blocks),
              },
      }
  }
}

function humanToolCall(
  block: Extract<ContentBlock, { kind: 'tool_call' }>,
): HumanBlock | undefined {
  const id = block.id
  if (!block.complete) return undefined
  return {
    id,
    kind: 'tool_call',
    call: block.callId,
    tool: block.tool,
    arguments: block.unparseable
      ? { encoding: 'unparseable', text: block.rawArguments }
      : { encoding: 'json', text: writeJsonLossless(block.arguments) },
    observation: null,
  }
}
