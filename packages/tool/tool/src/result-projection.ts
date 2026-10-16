// The pure projection of a ToolResult into model message blocks (P14).
import type { BlockId, ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import { toolResultShape } from './result-policy.ts'
import type { Attachment, ToolMessageContentBlock, ToolResult } from './results.ts'
import { filled, item, judgeAt, list, type Check, type ShapeRejection } from './shape.ts'

/** P14: the fixed prefix of an attachment address text. */
const ADDRESS_PREFIX = '附件地址（按需读取）：'

/** A block identity follows the content-block rule: a non-empty string. */
const blockId: Check<BlockId> = (value, at) => {
  const checked = filled(value, at)
  // `filled` accepted the text that content-block accepts as a block identity.
  return 'ok' in checked ? succeed(checked.ok as BlockId) : checked
}

type Projection = Readonly<{
  content: readonly ToolMessageContentBlock[]
  attachments: readonly Attachment[]
  ids: readonly BlockId[]
}>

/** The index of the first value that an earlier value repeats, or -1. */
function firstRepeat(values: readonly string[]): number {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) return index
    seen.add(value)
  }
  return -1
}

/** The identity rules of P14, in the order that a rejection reports them. */
const IDENTITY_RULES: readonly ((projection: Projection) => ShapeRejection | undefined)[] = [
  ({ content }) => {
    const repeat = firstRepeat(content.map(block => block.id))
    return repeat < 0 ? undefined : { field: `${item('content', repeat)}.id`, reason: 'duplicate' }
  },
  ({ attachments, ids }) =>
    ids.length === attachments.length
      ? undefined
      : { field: 'attachmentBlockIds', reason: 'count' },
  ({ ids }) => {
    const repeat = firstRepeat(ids)
    return repeat < 0
      ? undefined
      : { field: item('attachmentBlockIds', repeat), reason: 'duplicate' }
  },
  ({ content, ids }) => {
    const existing = new Set<string>(content.map(block => block.id))
    const collision = ids.findIndex(id => existing.has(id))
    return collision < 0
      ? undefined
      : { field: item('attachmentBlockIds', collision), reason: 'collision' }
  },
]

/** The text block that tells a reader where an attachment is. It is not a URL or a read. */
function addressBlock(id: BlockId, attachment: Attachment): TextContentBlock {
  return Object.freeze({
    kind: 'text',
    id,
    visibility: Object.freeze({ toHuman: true, toModel: true }),
    text: `${ADDRESS_PREFIX}${JSON.stringify({ storage: attachment.storage, key: attachment.key })}`,
  })
}

/**
 * Projects a result into model message blocks without reading any bytes (P14). The content blocks
 * that the model may see keep their order, then one address text block follows per attachment,
 * in order. `attachmentBlockIds` gives one fixed identity per attachment; a wrong count, a repeat
 * or a collision with a content block is rejected. Disclosure checks stay with the caller.
 */
export function projectToolResult(
  value: ToolResult<ContentBlock>,
  attachmentBlockIds: readonly BlockId[],
): Outcome<readonly ToolMessageContentBlock[], Readonly<{ field: string; reason: string }>> {
  const result = judgeAt(toolResultShape, value, 'value')
  if ('failure' in result) return result
  const ids = list(blockId)(attachmentBlockIds, 'attachmentBlockIds')
  if ('failure' in ids) return ids
  const projection: Projection = {
    content: result.ok.content,
    attachments: result.ok.attachments,
    ids: ids.ok,
  }
  const broken = IDENTITY_RULES.map(rule => rule(projection)).find(failure => failure !== undefined)
  if (broken !== undefined) return fail(broken)
  const visible = projection.content.filter(block => block.visibility.toModel)
  const addresses = projection.attachments.map((attachment, index) => {
    const id = projection.ids[index]
    // The count rule above makes every attachment index a valid identity index.
    return addressBlock(id as BlockId, attachment)
  })
  return succeed(Object.freeze([...visible, ...addresses]))
}
