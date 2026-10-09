import {
  contentBlockFromRepresentation,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { PlanExecutionContext, PlanInput } from '@omne-harness-lite/model-request-runtime'
import { jsonEqual } from './definitions.ts'

/** Only the wire projection consumes fixed bytes. There is no persistent source IO. */
export function resolveImageMessages(
  messages: PlanInput['messages'],
  execution: PlanExecutionContext,
): PlanInput['messages'] {
  if (!execution.imageBytes) return messages
  const sources = execution.imageBytes
  function resolveBlock(block: ContentBlock): ContentBlock {
    if (!block.visibility.toModel) return block
    if (block.kind === 'tool_result')
      return contentBlockFromRepresentation({ ...block, blocks: block.blocks.map(resolveBlock) })
    if (block.kind !== 'image' || 'inline' in block.data) return block
    if (execution.signal.aborted) throw new Error('Image projection interrupted')
    const reference = block.data
    const matches = sources.filter(source => jsonEqual({ ...source.reference }, { ...reference }))
    if (matches.length !== 1 || !(matches[0]!.bytes instanceof Uint8Array))
      throw new Error('Image bytes unavailable')
    return contentBlockFromRepresentation({
      ...block,
      data: { inline: Buffer.from(matches[0]!.bytes).toString('base64') },
    })
  }
  return messages.map(message => {
    const result = judgeMessage({ ...message, blocks: message.blocks.map(resolveBlock) })
    if (!('ok' in result)) throw new Error('Invalid image projection')
    return result.ok
  })
}
