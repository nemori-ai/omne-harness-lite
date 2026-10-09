import { expectTypeOf } from 'vitest'
import type {
  SessionWorkReading,
  OriginalRunJournal,
  BorrowedRunJournal,
  AttemptPermit,
} from '../src/index.ts'
import type { SourceToken } from '@omne-harness-lite/session-log'

expectTypeOf<keyof SessionWorkReading>().toEqualTypeOf<'scanWork' | 'readWork'>()
expectTypeOf<keyof OriginalRunJournal>().toEqualTypeOf<'borrow'>()
expectTypeOf<BorrowedRunJournal['generation']>().toEqualTypeOf<object>()
expectTypeOf<ReturnType<BorrowedRunJournal['currentGeneration']>>().toEqualTypeOf<object | null>()
expectTypeOf<ReturnType<BorrowedRunJournal['close']>>().toEqualTypeOf<Promise<void>>()

declare const work: Extract<Awaited<ReturnType<SessionWorkReading['readWork']>>, { kind: 'work' }>
declare const page: Extract<
  Awaited<ReturnType<SessionWorkReading['scanWork']>>,
  { kind: 'workPage' }
>
declare const journal: BorrowedRunJournal
// @ts-expect-error A work observation does not issue an attempt permit.
const permit: AttemptPermit = work
// @ts-expect-error A scan page does not carry a live execution authority.
page.authority
// @ts-expect-error A process-local generation is not a journal SourceToken.
const source: SourceToken = journal.generation
void permit
void source
