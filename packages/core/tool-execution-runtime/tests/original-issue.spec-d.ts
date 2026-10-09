import { expectTypeOf } from 'vitest'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type {
  ExecutionSubmission,
  ToolOriginalIssueClaim,
  ToolOriginalIssueIdentity,
  ToolOriginalIssueParticipant,
  ToolOriginalIssueAdmission,
  ToolOriginalIssueUnknown,
  ToolRuntimeDependencies,
  ToolRuntimeOriginalIssueDependencies,
  ToolRuntimeOriginalIssueFactory,
  ToolRuntimeInstance,
} from '../src/index.ts'

expectTypeOf<ToolRuntimeOriginalIssueDependencies>().toExtend<ToolRuntimeDependencies>()
expectTypeOf<ToolOriginalIssueParticipant['stopped']>().toEqualTypeOf<Promise<void>>()
expectTypeOf<
  ReturnType<ToolRuntimeOriginalIssueFactory['create']>
>().toEqualTypeOf<ToolRuntimeInstance>()
expectTypeOf<Parameters<ToolOriginalIssueParticipant['stageOriginalIn']>>().toEqualTypeOf<
  [StorageUnit]
>()
expectTypeOf<Parameters<ToolOriginalIssueParticipant['consumeOriginalIn']>>().toEqualTypeOf<
  [StorageUnit, ToolOriginalIssueClaim]
>()
expectTypeOf<
  Extract<
    Awaited<ReturnType<ToolOriginalIssueAdmission['admitOriginal']>>,
    { kind: 'alreadyIssued' }
  >
>().toEqualTypeOf<{
  readonly kind: 'alreadyIssued'
  readonly identity: ToolOriginalIssueIdentity
}>()
expectTypeOf<
  Extract<
    Awaited<ReturnType<ToolOriginalIssueAdmission['admitOriginal']>>,
    { kind: 'unknownCommit' }
  >
>().toEqualTypeOf<ToolOriginalIssueUnknown>()

declare const submission: ExecutionSubmission
declare const dependencies: ToolRuntimeDependencies
declare const identity: ToolOriginalIssueIdentity
// @ts-expect-error Ordinary Tool construction does not provide the same-unit support.
const unsupported: ToolRuntimeOriginalIssueDependencies = dependencies
// @ts-expect-error Ordinary Tool submit cannot carry a caller-provided participant.
submission.participant
// @ts-expect-error A data identity cannot be used as the original live claim.
const copiedClaim: ToolOriginalIssueClaim = identity
declare const replay: Extract<
  Awaited<ReturnType<ToolOriginalIssueAdmission['admitOriginal']>>,
  { kind: 'alreadyIssued' }
>
// @ts-expect-error Recognized originals cannot mint another launch claim.
replay.claim
declare const notStopped: Omit<ToolOriginalIssueParticipant, 'stopped'>
// @ts-expect-error A participant without actual stopped cannot transfer job responsibility.
const unfinished: ToolOriginalIssueParticipant = notStopped
void [unsupported, copiedClaim, replay, unfinished]
