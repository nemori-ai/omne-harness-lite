import { expectTypeOf } from 'vitest'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type {
  ExecutionSubmission,
  ToolOriginalIssueClaim,
  ToolOriginalIssueSupport,
  ToolOriginalIssueIdentity,
  ToolOriginalIssueParticipant,
  ToolOriginalIssueAdmission,
  ToolOriginalIssueUnknown,
  ToolRuntimeDependencies,
  ToolRuntimeOriginalIssueDependencies,
  ToolRuntimeOriginalIssueFactory,
  ToolPoolInstance,
  ToolRuntimeStartupOperations,
  ToolRuntimeRegistryOperations,
  PreparedToolExecution,
} from '../src/index.ts'

declare const nativeDependencies: ToolRuntimeOriginalIssueDependencies
// @ts-expect-error Native recovery reads its own task index, not a Session catalog.
nativeDependencies.owner
// @ts-expect-error The Session supplies the selected chain in the prepared request.
nativeDependencies.runnerHost
// @ts-expect-error Native construction cannot read complete Session history.
nativeDependencies.history
// @ts-expect-error Native construction cannot borrow a complete Session log.
nativeDependencies.backing
expectTypeOf<ToolOriginalIssueParticipant['stopped']>().toEqualTypeOf<Promise<void>>()
expectTypeOf<
  ReturnType<ToolRuntimeOriginalIssueFactory['create']>
>().toEqualTypeOf<ToolPoolInstance>()
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
declare const nativePool: ReturnType<ToolRuntimeOriginalIssueFactory['create']>
// @ts-expect-error Native submission requires selected inputs, their source and the prepared chain.
nativePool.operations.submit(submission)
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

declare const originalSupport: ToolOriginalIssueSupport
// @ts-expect-error Original issue consumes only same-unit Tool record operations.
originalSupport.log.readPrefixIn
// @ts-expect-error The native pool cannot enumerate Sessions through original support.
originalSupport.log.enumerate

declare const startup: ToolRuntimeStartupOperations
// @ts-expect-error The binding receives an actual pool factory, not a maintenance token.
startup.recoveryAccess()
declare const registry: ToolRuntimeRegistryOperations
// @ts-expect-error The runtime registry forwards prepared requests only.
registry.submit(submission)
declare const prepared: PreparedToolExecution
registry.submit(prepared)
