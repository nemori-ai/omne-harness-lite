import { expectTypeOf, it } from 'vitest'
import type { BlockId, ContentBlock, Visibility } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  IncompleteToolCallPart,
  Message,
  MessagePart,
  ToolCallPart,
  ToolMessage,
  ToolPart,
  ToolResultPart,
  UnparsedToolCallPart,
} from '@omne-harness/message'

it('ToolCallPart is a closed readonly shape', () => {
  expectTypeOf<ToolCallPart>().toEqualTypeOf<
    Readonly<{
      kind: 'tool_call'
      id: BlockId
      visibility: Visibility
      callId: string
      name: string
      arguments: JsonValue
    }>
  >()
})

it('the two variants carry text, not a value tree', () => {
  expectTypeOf<IncompleteToolCallPart>().toEqualTypeOf<
    Readonly<{
      kind: 'tool_call_incomplete'
      id: BlockId
      visibility: Visibility
      callId: string
      name: string
      partial: string
    }>
  >()
  expectTypeOf<UnparsedToolCallPart>().toEqualTypeOf<
    Readonly<{
      kind: 'tool_call_unparsed'
      id: BlockId
      visibility: Visibility
      callId: string
      name: string
      raw: string
    }>
  >()
})

it('ToolResultPart is a marker without content or status', () => {
  expectTypeOf<ToolResultPart>().toEqualTypeOf<
    Readonly<{ kind: 'tool_result'; id: BlockId; visibility: Visibility; callId: string }>
  >()
})

it('ToolPart is the union of the four parts and has no index signature', () => {
  expectTypeOf<ToolPart>().toEqualTypeOf<
    ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart | ToolResultPart
  >()
  expectTypeOf<string extends keyof ToolResultPart ? true : false>().toEqualTypeOf<false>()
  expectTypeOf<ToolPart['kind']>().toEqualTypeOf<
    'tool_call' | 'tool_call_incomplete' | 'tool_call_unparsed' | 'tool_result'
  >()
})

it('a message part is a content block or a tool part', () => {
  expectTypeOf<MessagePart>().toEqualTypeOf<ContentBlock | ToolPart>()
})

it('ToolMessage is a tool message that starts with its marker', () => {
  expectTypeOf<ToolMessage>().toEqualTypeOf<
    Message & Readonly<{ role: 'tool'; blocks: readonly [ToolResultPart, ...ContentBlock[]] }>
  >()
})
