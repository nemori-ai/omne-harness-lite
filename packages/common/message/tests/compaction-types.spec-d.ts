import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  judgeCompaction,
  judgeMessage,
  type CompactedRange,
  type CompactionContext,
  type CompactionDerivation,
  type CompactionJudgment,
  type CompactionMessage,
  type CompactionRejection,
  type CoveredEntry,
  type Message,
  type MessageId,
  type MessageRejection,
  type RecordEntryRef,
  type UserMessage,
} from '@omne-harness/message'

declare const id: MessageId
declare const block: ContentBlock
declare const range: CompactedRange
declare const derivation: CompactionDerivation
declare const ref: RecordEntryRef

it('CompactionMessage is a compaction message whose summary has no tool part', () => {
  expectTypeOf<CompactionMessage>().toEqualTypeOf<
    Readonly<{
      id: MessageId
      role: 'compaction'
      blocks: readonly [ContentBlock, ...ContentBlock[]]
      covers: CompactedRange
      retained: readonly RecordEntryRef[]
      derivation: CompactionDerivation
    }>
  >()
  expectTypeOf<CompactionMessage>().toExtend<Message>()
})

it('a compaction message needs all three keys', () => {
  const whole: Message = {
    id,
    role: 'compaction',
    blocks: [block],
    covers: range,
    retained: [ref],
    derivation,
  }
  expectTypeOf(whole).toExtend<Message>()
  // @ts-expect-error a compaction message without `derivation` is not a message
  const lacking: Message = { id, role: 'compaction', blocks: [block], covers: range, retained: [] }
  expectTypeOf(lacking).toEqualTypeOf<Message>()
  // @ts-expect-error a compaction message without any of the three keys is not a message
  const bare: Message = { id, role: 'compaction', blocks: [block] }
  expectTypeOf(bare).toEqualTypeOf<Message>()
})

it('a message of another role cannot carry the three keys', () => {
  // @ts-expect-error `covers` belongs to the compaction message only
  const user: Message = { id, role: 'user', blocks: [block], covers: range }
  expectTypeOf(user).toEqualTypeOf<Message>()
  expectTypeOf<UserMessage>().not.toHaveProperty('covers')
})

it('a record entry reference is a branded string, not a plain one', () => {
  expectTypeOf<RecordEntryRef>().toExtend<string>()
  expectTypeOf<string>().not.toExtend<RecordEntryRef>()
})

it('the history rules and the shape rules have separate rejection values', () => {
  expectTypeOf<'covers' | 'retained' | 'derivation'>().toExtend<MessageRejection>()
  expectTypeOf<CompactionRejection>().not.toExtend<MessageRejection>()
})

it('a failed judgment names the entry it points at, or null', () => {
  expectTypeOf<
    Extract<CompactionJudgment, { rejected: CompactionRejection }>['ref']
  >().toEqualTypeOf<RecordEntryRef | null>()
  expectTypeOf(judgeCompaction).parameters.toEqualTypeOf<[unknown, CompactionContext]>()
  expectTypeOf<CoveredEntry['message']>().toEqualTypeOf<Message | null>()
})

it('the role of a success value of judgeMessage narrows it to the compaction variant', () => {
  const judged = judgeMessage({})
  if (!('ok' in judged)) return
  const message = judged.ok
  if (message.role === 'compaction') expectTypeOf(message).toEqualTypeOf<CompactionMessage>()
})
