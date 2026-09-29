import { expectTypeOf, test } from 'vitest'
import type { CallKey as SharedCallKey, CreationKey } from '@omne-harness-lite/messages'
import type {
  CallKey,
  CallConsumer,
  AcquireCallInput,
  ModelRuntimeService,
  OpenCallInput,
  SettleReplyInput,
} from '@omne-harness-lite/model-request-runtime'

test('D110 keeps one shared identity and independent consumer controls', () => {
  expectTypeOf<CallKey>().toEqualTypeOf<SharedCallKey>()
  expectTypeOf<OpenCallInput['creationKey']>().toEqualTypeOf<CreationKey>()
  expectTypeOf<keyof CallConsumer>().toEqualTypeOf<'wait' | 'release' | 'stopped'>()
  expectTypeOf<Parameters<ModelRuntimeService['acquireCall']>>().toEqualTypeOf<[AcquireCallInput]>()
  expectTypeOf<SettleReplyInput['disposition']>().toEqualTypeOf<
    { readonly consumed: { readonly by: string } } | { readonly vetoed: { readonly by: string } }
  >()
})
