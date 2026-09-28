import { expectTypeOf } from 'vitest'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  ModelRuntimeService,
  OpenCallInput,
  SettleReplyInput,
  DispatchSuccess,
} from '../src/service-types.ts'

declare const service: ModelRuntimeService
declare const session: SessionRef
declare const call: OpenCallInput

expectTypeOf<keyof ModelRuntimeService>().toEqualTypeOf<
  | 'legalTargets'
  | 'displayList'
  | 'effectiveModel'
  | 'selectModel'
  | 'openCall'
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
