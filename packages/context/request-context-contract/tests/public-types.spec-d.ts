import { expectTypeOf, test } from 'vitest'
import type {
  BlockRevision,
  ViewRevision,
  EligibilityId,
  SnapshotResult,
  ChangesResult,
} from '@omne-harness/runtime-context-contract'
import type { CompactionMessage } from '@omne-harness/message'
import type {
  BlockMaterial,
  SnapshotMaterial,
  ContextReadGroup,
  ContextTransition,
  AssemblyOutcome,
  AssemblyCall,
  CallIdentity,
  PreparedInputKey,
  HistorySource,
  ConversionResultSource,
  WindowUsageValue,
  ContextAccountingInbox,
  SystemRecoveryAccess,
  HistoryRow,
  CompactionPolicy,
  CandidateRef,
  PlanId,
} from '@omne-harness/request-context-contract'
test('RC-owned identities and revisions stay in their original types', () => {
  expectTypeOf<BlockMaterial['revision']>().toEqualTypeOf<BlockRevision>()
  expectTypeOf<SnapshotMaterial['revision']>().toEqualTypeOf<ViewRevision>()
  expectTypeOf<SnapshotMaterial['eligibility']>().toEqualTypeOf<EligibilityId>()
  expectTypeOf<ContextReadGroup['read']>().toEqualTypeOf<SnapshotResult | ChangesResult>()
  expectTypeOf<ContextTransition['message']>().toEqualTypeOf<CompactionMessage>()
  expectTypeOf<AssemblyOutcome['kind']>().toEqualTypeOf<
    'candidate-before-extension' | 'candidate-fixable' | 'needs-compaction' | 'cannot-fit'
  >()
  expectTypeOf<AssemblyCall<string>['access']>().not.toBeNullable()
  expectTypeOf<CallIdentity>().toEqualTypeOf<Omit<AssemblyCall<unknown>, 'access'>>()
  expectTypeOf<PreparedInputKey['identity']>().toEqualTypeOf<CallIdentity>()
  expectTypeOf<Parameters<HistorySource<string>['read']>[0]['access']>().not.toBeNullable()
  expectTypeOf<Parameters<ConversionResultSource<string>['read']>[0]['access']>().not.toBeNullable()
  expectTypeOf<
    Parameters<ContextAccountingInbox<string>['usage']>[0]['access']
  >().not.toBeNullable()
  expectTypeOf<SystemRecoveryAccess<string>['scope']>().toEqualTypeOf<'system'>()
  expectTypeOf<WindowUsageValue['kind']>().toEqualTypeOf<
    'not-fixed' | 'unmeasured' | 'actual' | 'estimate'
  >()
  expectTypeOf<Extract<HistoryRow, { message: { role: 'user' } }>['sourceCall']>().toBeNever()
  expectTypeOf<CompactionPolicy['triggerPercent']>().toEqualTypeOf<string | null>()
  expectTypeOf<CandidateRef>().not.toEqualTypeOf<PlanId>()
})
