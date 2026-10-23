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
  AssemblyInput,
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
  expectTypeOf<AssemblyInput<string>['identity']['access']>().not.toBeNullable()
  expectTypeOf<CompactionPolicy['triggerPercent']>().toEqualTypeOf<string | null>()
  expectTypeOf<CandidateRef>().not.toEqualTypeOf<PlanId>()
})
