import { expectTypeOf, test } from 'vitest'
import type {
  AssemblyOperations,
  AssemblyOutcome,
  AssemblyCall,
  CallIdentity,
  PreparedInputKey,
  HistorySource,
  ConversionResultSource,
  HistoryRow,
  CompactionPolicy,
} from '@omne-harness/request-context-contract'
test('RC-owned identities and revisions stay in their original types', () => {
  expectTypeOf<AssemblyOutcome['kind']>().toEqualTypeOf<
    'candidate-before-extension' | 'candidate-fixable' | 'needs-compaction' | 'cannot-fit'
  >()
  expectTypeOf<AssemblyCall<string>['access']>().not.toBeNullable()
  expectTypeOf<CallIdentity>().toEqualTypeOf<Omit<AssemblyCall<unknown>, 'access'>>()
  expectTypeOf<PreparedInputKey['identity']>().toEqualTypeOf<CallIdentity>()
  expectTypeOf<Parameters<HistorySource<string>['read']>[0]['access']>().not.toBeNullable()
  expectTypeOf<Parameters<ConversionResultSource<string>['read']>[0]['access']>().not.toBeNullable()
  expectTypeOf<Extract<HistoryRow, { message: { role: 'user' } }>['sourceCall']>().toBeNever()
  expectTypeOf<CompactionPolicy['triggerPercent']>().toEqualTypeOf<string | null>()
  expectTypeOf<keyof AssemblyOperations<string>>().toEqualTypeOf<'assemble' | 'resume'>()
})
