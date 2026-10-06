import { judgeContentBlock, type ContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'

export function copyPlanContentBlocks(values: readonly unknown[]): ContentBlock[] | undefined {
  const blocks: ContentBlock[] = []
  for (const value of values) {
    const judged = judgeContentBlock(value)
    if (!('ok' in judged)) return undefined
    blocks.push(judged.ok)
  }
  return blocks
}

export function copyPlanMessages(values: readonly Message[]): Message[] | undefined {
  const messages: Message[] = []
  for (const value of values) {
    const judged = judgeMessage(value)
    if ('rejected' in judged) return undefined
    messages.push(judged.ok)
  }
  return messages
}
