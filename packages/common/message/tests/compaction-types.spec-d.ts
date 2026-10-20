import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  isCompactionMessage,
  judgeCompaction,
  type CompactedRange,
  type CompactionContext,
  type CompactionDerivation,
  type CompactionJudgment,
  type CompactionMessage,
  type CompactionRejection,
  type CoveredEntry,
  type Message,
  type MessageRejection,
  type RecordEntryRef,
} from '@omne-harness/message'

it('CompactionMessage is a compaction message whose summary has no tool part', () => {
  expectTypeOf<CompactionMessage>().toEqualTypeOf<
    Message &
      Readonly<{
        role: 'compaction'
        blocks: readonly [ContentBlock, ...ContentBlock[]]
        covers: CompactedRange
        retained: readonly RecordEntryRef[]
        derivation: CompactionDerivation
      }>
  >()
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

it('isCompactionMessage narrows a message to the variant', () => {
  expectTypeOf(isCompactionMessage).guards.toEqualTypeOf<CompactionMessage>()
})
