import { expectTypeOf } from 'vitest'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  ModelRuntimeService,
  OpenCallInput,
  SettleReplyInput,
  DispatchSuccess,
  RuntimeConstruction,
  ServiceInvalidInput,
  ModelIdentitySource,
} from '../src/service-types.ts'
import type { PlannedSemantics, TokenMargin } from '../src/types.ts'

declare const service: ModelRuntimeService
declare const session: SessionRef
declare const call: OpenCallInput
declare const construction: RuntimeConstruction<PlannedSemantics, never>
declare const ids: ModelIdentitySource

const invalidAcquisition: ReturnType<typeof construction.transport.acquire> = {
  invalidInput: { reason: 'malformed' },
}
void invalidAcquisition

expectTypeOf(construction.tokenMargin).toEqualTypeOf<TokenMargin>()
expectTypeOf(ids.message()).toEqualTypeOf<import('@omne-harness-lite/messages').MessageId>()
const exactExcess: ServiceInvalidInput = {
  invalidInput: {
    reason: 'input_limit_exceeded',
    basis: 'exact',
    metric: 'maxImages',
    actual: 2,
    limit: 1,
  },
}
const estimatedExcess: ServiceInvalidInput = {
  invalidInput: {
    reason: 'input_limit_exceeded',
    basis: 'estimated',
    metric: 'maxInputTokens',
    estimatedTokens: 8,
    admissionTokens: 10,
    limit: 9,
  },
}
const missingExcessMetadata: ServiceInvalidInput = {
  // @ts-expect-error Exceeded input must retain the basis and count facts.
  invalidInput: { reason: 'input_limit_exceeded' },
}
const mixedEstimate: ServiceInvalidInput = {
  invalidInput: {
    reason: 'input_limit_exceeded',
    basis: 'estimated',
    metric: 'maxInputTokens',
    estimatedTokens: 8,
    admissionTokens: 10,
    // @ts-expect-error Estimated admission cannot claim an actual count.
    actual: 10,
    limit: 9,
  },
}
void exactExcess
void estimatedExcess
void missingExcessMetadata
void mixedEstimate

expectTypeOf<keyof ModelRuntimeService>().toEqualTypeOf<
  | 'legalTargets'
  | 'displayList'
  | 'effectiveModel'
  | 'selectModel'
  | 'openCall'
  | 'acquireCall'
  | 'dispatch'
  | 'dispatchAgain'
  | 'interrupt'
  | 'releaseCall'
  | 'reconcile'
  | 'readAttempts'
  | 'settleReply'
  | 'canDispatchAgain'
>()
expectTypeOf(call.targetChangedBy).toEqualTypeOf<
  import('@omne-harness-lite/content-blocks').CapabilityId | undefined
>()
expectTypeOf<
  Extract<
    DispatchSuccess,
    { readonly settled: unknown; readonly failureSubject: unknown }
  >['failureSubject']
>().toEqualTypeOf<import('@omne-harness-lite/loop-extension').AfterModelCallFailureSubject>()

// The service cannot write a persisted disposition without the caller's message in the same batch.
// @ts-expect-error Persisted belongs to the caller's [M,R] path.
const persisted: SettleReplyInput = { session, callId: 'call', disposition: 'persisted' }
// @ts-expect-error Run identity cannot appear without attempt and availability report.
const incompleteRun: OpenCallInput = { ...call, run: 'run', attempt: undefined, report: undefined }
// @ts-expect-error No Run call cannot supply an unrelated availability report.
const unrelatedReport: OpenCallInput = { ...call, report: {} }
// @ts-expect-error Call identity is always paired with its session.
service.releaseCall({ callId: 'call' })
// @ts-expect-error The four dispatch branches have no catch-all response.
const arbitrarySuccess: DispatchSuccess = { settled: { outcome: 'complete' } }
expectTypeOf(persisted).toEqualTypeOf<SettleReplyInput>()
expectTypeOf(incompleteRun).toEqualTypeOf<OpenCallInput>()
expectTypeOf(unrelatedReport).toEqualTypeOf<OpenCallInput>()
expectTypeOf(arbitrarySuccess).toEqualTypeOf<DispatchSuccess>()
