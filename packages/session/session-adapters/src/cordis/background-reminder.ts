import { createHash } from 'node:crypto'
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import type { MessageContentBlock, MessageId, SystemReminderMessage } from '@omne-harness/message'
import type { Effect, ToolCallId, ToolDelivery, ToolTerminal } from '@omne-harness/tool-contract'

type ResultDelivery = Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>

const VISIBLE = { toHuman: true, toModel: true } as const

function digest(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}

function terminalText(terminal: ToolTerminal): string {
  switch (terminal.kind) {
    case 'completed':
      return 'completed'
    case 'failed':
      return `failed (${terminal.cause}): ${terminal.diagnostic}`
    case 'unavailable':
      return `was unavailable: ${terminal.reason}`
    case 'interrupted':
      return `was interrupted (${terminal.cause.kind})`
    case 'no-response':
      return `ended without a response: ${terminal.reason}`
  }
}

function effectText(effect: Effect): string {
  switch (effect.kind) {
    case 'not-started':
      return 'it did not start'
    case 'not-occurred':
      return 'no effect occurred'
    case 'occurred':
      return 'its effect occurred'
    case 'unknown':
      return `whether it had an effect is unknown (${effect.diagnostic})`
  }
}

const forModel = (blocks: readonly ContentBlock[]): MessageContentBlock[] =>
  blocks.filter(
    (block): block is MessageContentBlock => block.kind !== 'thinking' && block.visibility.toModel,
  )

/**
 * The system reminder that the outcome of a backgrounded call becomes. The first block names
 * the call as the placeholder message did, then the terminal and the effect; the model-visible
 * content of the result follows unchanged. Offloaded output and attachments stay with the result
 * and are only named.
 */
export function backgroundReminder(
  call: ToolCallId,
  delivery: ResultDelivery,
): SystemReminderMessage {
  const id = digest(['background-reminder', call, delivery.key.result])
  const { value } = delivery
  const notes: string[] = []
  if (value.original.kind === 'offloaded')
    notes.push(`The full output of call ${call} is kept with its result and is not shown here.`)
  if (value.attachments.length > 0)
    notes.push(
      `${value.attachments.length} attachment(s) of call ${call} are kept with its result and are not shown here.`,
    )
  const head: MessageContentBlock = {
    kind: 'text',
    id: `blk_${id}` as BlockId,
    visibility: VISIBLE,
    text: [
      `The background call ${call} ${terminalText(delivery.terminal)}; ${effectText(delivery.effect)}. This is its outcome.`,
      ...notes,
    ].join(' '),
  }
  const summary = value.original.kind === 'offloaded' ? value.original.summary : []
  return {
    id: `msg_${id}` as MessageId,
    role: 'system_reminder',
    blocks: [head, ...forModel(value.content), ...forModel(summary)],
  }
}
