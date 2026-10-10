import { expectTypeOf } from 'vitest'
import type {
  SessionWorkReading,
  OriginalRunJournal as CoreRunJournal,
  BorrowedRunJournal as CoreBorrow,
} from '@omne-harness-lite/session-runtime'
import type { LocalSessionIngress, OriginalRunJournal, BorrowedRunJournal } from '../src/index.ts'

expectTypeOf<LocalSessionIngress['scanWork']>().toEqualTypeOf<SessionWorkReading['scanWork']>()
expectTypeOf<LocalSessionIngress['readWork']>().toEqualTypeOf<SessionWorkReading['readWork']>()
expectTypeOf<OriginalRunJournal>().toEqualTypeOf<CoreRunJournal>()
expectTypeOf<BorrowedRunJournal>().toEqualTypeOf<CoreBorrow>()
expectTypeOf<LocalSessionIngress['runJournal']>().toEqualTypeOf<CoreRunJournal>()
