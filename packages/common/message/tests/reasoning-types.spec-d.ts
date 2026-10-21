import { expectTypeOf, it } from 'vitest'
import type { BlockId, Visibility } from '@omne-harness/content-block'
import {
  judgeMessage,
  type AssistantMessage,
  type CompactionMessage,
  type Message,
  type MessageContentBlock,
  type MessageId,
  type MessagePart,
  type MessageRejection,
  type ReasoningReplay,
  type ReasoningStatePart,
  type SystemReminderMessage,
  type ToolInternalMessage,
  type ToolMessage,
  type ToolResultPart,
  type UserMessage,
} from '@omne-harness/message'

declare const id: MessageId
declare const block: MessageContentBlock
declare const state: ReasoningStatePart
declare const marker: ToolResultPart
declare const replay: ReasoningReplay

it('ReasoningStatePart is a closed readonly shape, and a message part', () => {
  expectTypeOf<ReasoningStatePart>().toEqualTypeOf<
    Readonly<{
      kind: 'reasoning_state'
      id: BlockId
      visibility: Visibility
      payload: string
      pairs: readonly BlockId[]
    }>
  >()
  expectTypeOf<ReasoningStatePart>().toExtend<MessagePart>()
})

it('ReasoningReplay has scope, format and at, and nothing else', () => {
  expectTypeOf<ReasoningReplay>().toEqualTypeOf<
    Readonly<{ scope: string; format: string; at: readonly number[] }>
  >()
})

it('only the blocks of an assistant message may hold a reasoning state part', () => {
  const assistant: Message = { id, role: 'assistant', blocks: [state], replay }
  expectTypeOf(assistant).toExtend<Message>()
  // @ts-expect-error a reasoning state part is not allowed in a user message
  const user: UserMessage['blocks'] = [state]
  // @ts-expect-error a reasoning state part is not allowed in a tool_internal message
  const internal: ToolInternalMessage['blocks'] = [state]
  // @ts-expect-error a reasoning state part is not allowed in a system_reminder message
  const reminder: SystemReminderMessage['blocks'] = [state]
  // @ts-expect-error a reasoning state part is not allowed in a compaction summary
  const summary: CompactionMessage['blocks'] = [state]
  // @ts-expect-error a reasoning state part is not allowed in the body of a tool message
  const body: ToolMessage['blocks'] = [marker, state]
  expectTypeOf([user, internal, reminder, summary, body]).not.toBeAny()
})

it('only an assistant message has replay, and it is optional there', () => {
  expectTypeOf<AssistantMessage['replay']>().toEqualTypeOf<ReasoningReplay | undefined>()
  expectTypeOf<keyof AssistantMessage>().toEqualTypeOf<'id' | 'role' | 'blocks' | 'replay'>()
  expectTypeOf<keyof UserMessage>().toEqualTypeOf<'id' | 'role' | 'blocks'>()
  expectTypeOf<keyof ToolMessage>().toEqualTypeOf<'id' | 'role' | 'blocks'>()
  expectTypeOf<keyof ToolInternalMessage>().toEqualTypeOf<'id' | 'role' | 'blocks'>()
  expectTypeOf<keyof SystemReminderMessage>().toEqualTypeOf<'id' | 'role' | 'blocks'>()
  expectTypeOf<keyof CompactionMessage>().toEqualTypeOf<
    'id' | 'role' | 'blocks' | 'covers' | 'retained' | 'derivation'
  >()
  // @ts-expect-error a user message has no replay
  const user: Message = { id, role: 'user', blocks: [block], replay }
  expectTypeOf(user).not.toBeAny()
})

it('MessageRejection has the three reasoning values', () => {
  expectTypeOf<'payload' | 'pairs' | 'replay'>().toExtend<MessageRejection>()
})

it('an assistant message that judgeMessage admits narrows to the one type with replay', () => {
  const judged = judgeMessage({})
  if (!('ok' in judged) || judged.ok.role !== 'assistant') return
  expectTypeOf(judged.ok.replay).toEqualTypeOf<ReasoningReplay | undefined>()
})
