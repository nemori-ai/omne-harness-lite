// Compile-time checks of the result push (SPEC「结果推送与保存」), the start fence and the
// acceptance record of P04. Each `@ts-expect-error` names the diagnostic the accepted types produce.
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { expectTypeOf, it } from 'vitest'
import type {
  Access,
  DurableEvidence,
  ToolDelivery,
  ToolDeliveryFailure,
  ToolDeliveryKey,
  ToolResultReceiver,
  ToolSavedReceipt,
} from '@omne-harness/tool-contract'
import type {
  ToolPermitConsumption,
  ToolPermitRef,
  ToolStartAcceptance,
  ToolStartAuthority,
  ToolStartFence,
} from '@omne-harness/tool-contract/provider'

type Result = Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>
type AccountPush = Extract<ToolDelivery<ContentBlock>, { kind: 'account' }>

it('types push with an access, one delivery and a signal, and the saved receipt as the success', () => {
  expectTypeOf<Parameters<ToolResultReceiver<string, ContentBlock>['push']>[0]>().toEqualTypeOf<
    Readonly<{ access: Access<string>; delivery: ToolDelivery<ContentBlock>; signal: AbortSignal }>
  >()
  expectTypeOf<ReturnType<ToolResultReceiver<string, ContentBlock>['push']>>().toEqualTypeOf<
    Promise<Outcome<ToolSavedReceipt, ToolDeliveryFailure>>
  >()
  expectTypeOf<keyof ToolSavedReceipt>().toEqualTypeOf<'key' | 'evidence'>()
})

it('keys a result by producer, reference and version, and an account by event and revision', () => {
  expectTypeOf<Extract<ToolDeliveryKey, { kind: 'result' }>['producer']>().toEqualTypeOf<'tool'>()
  expectTypeOf<keyof Extract<ToolDeliveryKey, { kind: 'account' }>>().toEqualTypeOf<
    'kind' | 'producer' | 'reference' | 'event' | 'revision'
  >()
  expectTypeOf<Result['key']>().toEqualTypeOf<Extract<ToolDeliveryKey, { kind: 'result' }>>()
  expectTypeOf<Result['account']>().toExtend<object | null>()
  // The payload does not copy the tenant: it comes from the reference only.
  expectTypeOf<Result>().not.toHaveProperty('tenant')
})

declare const result: Result
declare const accountPush: AccountPush

it('refuses a payload whose key belongs to the other branch, or another producer', () => {
  // @ts-expect-error TS2322: an account key cannot key a result payload.
  const crossed: Result = { ...result, key: accountPush.key }
  void crossed
  // @ts-expect-error TS2322: the producer kind of a Tool key is 'tool'.
  const foreign: Result = { ...result, key: { ...result.key, producer: 'model' } }
  void foreign
})

it('names a closed set of backpressured resources', () => {
  expectTypeOf<Extract<ToolDeliveryFailure, { kind: 'backpressured' }>['resource']>().toEqualTypeOf<
    'records' | 'bytes' | 'attachments' | 'in-flight'
  >()
  // @ts-expect-error TS2322: 'cpu' is not a resource of the push.
  const failure: ToolDeliveryFailure = { kind: 'backpressured', resource: 'cpu' }
  void failure
})

declare const fence: ToolStartFence<string>

it('gives the outer caller only invalidate, and lets the start authority serve the fence', () => {
  expectTypeOf<keyof ToolStartFence<string>>().toEqualTypeOf<'invalidate'>()
  expectTypeOf<ToolStartAuthority<string>>().toExtend<ToolStartFence<string>>()
  // @ts-expect-error TS2339: the fence holds no consume; the outer caller cannot start a call.
  void fence.consume
})

declare const permitText: string & { readonly brand: 'PermitId' }
declare const tenant: TenantId
declare const decision: DurableEvidence & { readonly owner: 'authorization' }

it('takes a permit reference and a consumption fact of the authorization shape as they are', () => {
  // The authorization values have a branded text and a narrowed evidence; they stay assignable.
  const permit: ToolPermitRef = { tenant, permit: permitText }
  const fact: ToolPermitConsumption = {
    permit,
    consumer: { owner: 'start-authority', work: 'call-1', position: 'call-1' },
    evidence: decision,
  }
  expectTypeOf<ToolStartAcceptance['authorizations']>().toEqualTypeOf<
    readonly ToolPermitConsumption[]
  >()
  void fact
  // @ts-expect-error TS2741: a permit reference names its tenant.
  const bare: ToolPermitRef = { permit: permitText }
  void bare
})
