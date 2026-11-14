import type { BlockId, ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { toolResultShape } from './result-policy.ts'
import type { Attachment, ToolMessageContentBlock, ToolResult } from './results.ts'
import {
  filled,
  firstRepeat,
  item,
  judgeAt,
  list,
  type Check,
  type ShapeRejection,
} from './shape.ts'

const ADDRESS_PREFIX = '附件地址（按需读取）：'

const blockId: Check<BlockId> = (value, at) => {
  const checked = filled(value, at)
  return 'ok' in checked ? succeed(checked.ok as BlockId) : checked
}

type Projection = Readonly<{
  content: readonly ToolMessageContentBlock[]
  attachments: readonly Attachment[]
  ids: readonly BlockId[]
}>

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

function addressBlock(id: BlockId, attachment: Attachment): TextContentBlock {
  return Object.freeze({
    kind: 'text',
    id,
    visibility: Object.freeze({ toHuman: true, toModel: true }),
    text: `${ADDRESS_PREFIX}${JSON.stringify({ storage: attachment.storage, key: attachment.key })}`,
  })
}

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
    return addressBlock(id as BlockId, attachment)
  })
  return succeed(Object.freeze([...visible, ...addresses]))
}
