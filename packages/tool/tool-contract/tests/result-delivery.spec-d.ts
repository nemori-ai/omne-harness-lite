import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import { expectTypeOf, it } from 'vitest'
import type {
  Access,
  ToolDelivery,
  ToolDeliveryFailure,
  ToolDeliveryKey,
  ToolResultReceiver,
  ToolSavedReceipt,
} from '@omne-harness/tool-contract'
import type {
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

it('keeps no authorization on a start acceptance', () => {
  expectTypeOf<keyof ToolStartAcceptance>().toEqualTypeOf<
    'tenant' | 'call' | 'start' | 'permit' | 'guards' | 'executorReceipt' | 'acceptance'
  >()
})
