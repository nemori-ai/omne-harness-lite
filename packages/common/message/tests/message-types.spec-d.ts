import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  judgeMessage,
  type AssistantMessage,
  type CallPart,
  type CompactionMessage,
  type IncompleteToolCallPart,
  type LogMessageRole,
  type Message,
  type MessageId,
  type MessageRoleMap,
  type SystemReminderMessage,
  type ToolCallPart,
  type ToolInternalMessage,
  type ToolMessage,
  type ToolResultPart,
  type UnparsedToolCallPart,
  type UserMessage,
} from '@omne-harness/message'

declare const id: MessageId
declare const block: ContentBlock
declare const marker: ToolResultPart
declare const call: ToolCallPart
declare const incomplete: IncompleteToolCallPart
declare const unparsed: UnparsedToolCallPart

it('the role map has exactly the log roles as keys, each with its own message type', () => {
  expectTypeOf<keyof MessageRoleMap>().toEqualTypeOf<LogMessageRole>()
  expectTypeOf<MessageRoleMap>().toEqualTypeOf<{
    user: UserMessage
    assistant: AssistantMessage
    tool: ToolMessage
    tool_internal: ToolInternalMessage
    system_reminder: SystemReminderMessage
    compaction: CompactionMessage
  }>()
})

it('Message is the union of the six role types, told apart by role', () => {
  expectTypeOf<Message>().toEqualTypeOf<
    | UserMessage
    | AssistantMessage
    | ToolMessage
    | ToolInternalMessage
    | SystemReminderMessage
    | CompactionMessage
  >()
  expectTypeOf<Message['role']>().toEqualTypeOf<LogMessageRole>()
})

it('each role type has the blocks that its role allows, and at least one', () => {
  expectTypeOf<UserMessage>().toEqualTypeOf<
    Readonly<{ id: MessageId; role: 'user'; blocks: readonly [ContentBlock, ...ContentBlock[]] }>
  >()
  expectTypeOf<ToolInternalMessage['blocks']>().toEqualTypeOf<
    readonly [ContentBlock, ...ContentBlock[]]
  >()
  expectTypeOf<SystemReminderMessage['blocks']>().toEqualTypeOf<
    readonly [ContentBlock, ...ContentBlock[]]
  >()
  expectTypeOf<AssistantMessage['blocks']>().toEqualTypeOf<
    readonly [ContentBlock | CallPart, ...(ContentBlock | CallPart)[]]
  >()
  expectTypeOf<CallPart>().toEqualTypeOf<
    ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart
  >()
  expectTypeOf<ToolMessage['blocks']>().toEqualTypeOf<
    readonly [ToolResultPart, ...ContentBlock[]]
  >()
})

it('a user, tool_internal, system_reminder, or compaction message has content only', () => {
  // @ts-expect-error a call part is not allowed in a user message
  const userCall: UserMessage['blocks'] = [call]
  // @ts-expect-error a marker is not allowed in a user message
  const userMarker: UserMessage['blocks'] = [marker]
  // @ts-expect-error a call part is not allowed in a tool_internal message
  const internalCall: ToolInternalMessage['blocks'] = [call]
  // @ts-expect-error a marker is not allowed in a tool_internal message
  const internalMarker: ToolInternalMessage['blocks'] = [marker]
  // @ts-expect-error a call part is not allowed in a system_reminder message
  const reminderCall: SystemReminderMessage['blocks'] = [call]
  // @ts-expect-error a marker is not allowed in a system_reminder message
  const reminderMarker: SystemReminderMessage['blocks'] = [marker]
  // @ts-expect-error a call part is not allowed in a compaction summary
  const summaryCall: CompactionMessage['blocks'] = [call]
  // @ts-expect-error a marker is not allowed in a compaction summary
  const summaryMarker: CompactionMessage['blocks'] = [marker]
  expectTypeOf([
    userCall,
    userMarker,
    internalCall,
    internalMarker,
    reminderCall,
    reminderMarker,
    summaryCall,
    summaryMarker,
  ]).not.toBeAny()
})

it('an assistant message has content and call parts, and no marker', () => {
  const assistant: Message = { id, role: 'assistant', blocks: [block, call, incomplete, unparsed] }
  expectTypeOf(assistant).toExtend<Message>()
  // @ts-expect-error a marker is not allowed in an assistant message
  const withMarker: AssistantMessage['blocks'] = [block, marker]
  expectTypeOf(withMarker).not.toBeAny()
})

it('no message has an empty list of blocks', () => {
  // @ts-expect-error a user message has at least one block
  const empty: Message = { id, role: 'user', blocks: [] }
  expectTypeOf(empty).not.toBeAny()
})

it('a switch over the role covers the six roles and nothing is left in default', () => {
  function name(message: Message): string {
    switch (message.role) {
      case 'user':
        return expectTypeOf(message).toEqualTypeOf<UserMessage>() && 'user'
      case 'assistant':
        return expectTypeOf(message).toEqualTypeOf<AssistantMessage>() && 'assistant'
      case 'tool':
        return expectTypeOf(message).toEqualTypeOf<ToolMessage>() && 'tool'
      case 'tool_internal':
        return expectTypeOf(message).toEqualTypeOf<ToolInternalMessage>() && 'tool_internal'
      case 'system_reminder':
        return expectTypeOf(message).toEqualTypeOf<SystemReminderMessage>() && 'system_reminder'
      case 'compaction':
        return expectTypeOf(message).toEqualTypeOf<CompactionMessage>() && 'compaction'
      default:
        return expectTypeOf(message).toBeNever() && 'never'
    }
  }
  expectTypeOf(name).returns.toEqualTypeOf<string>()
})

it('a tool message starts with a marker, and has no tool part after it', () => {
  const tool: Message = { id, role: 'tool', blocks: [marker, block] }
  expectTypeOf(tool).toExtend<Message>()
  // @ts-expect-error the first block of a tool message is the marker
  const unmarked: Message = { id, role: 'tool', blocks: [block] }
  expectTypeOf(unmarked).not.toBeAny()
  // @ts-expect-error a second marker is not allowed in a tool message
  const twice: ToolMessage['blocks'] = [marker, marker]
  expectTypeOf(twice).not.toBeAny()
  // @ts-expect-error a call part is not allowed in a tool message
  const withCall: ToolMessage['blocks'] = [marker, call]
  expectTypeOf(withCall).not.toBeAny()
})

it('the success value of judgeMessage is a Message that the role narrows', () => {
  const judged = judgeMessage({})
  if (!('ok' in judged)) return
  const message = judged.ok
  expectTypeOf(message).toEqualTypeOf<Message>()
  if (message.role === 'tool') expectTypeOf(message).toEqualTypeOf<ToolMessage>()
})
