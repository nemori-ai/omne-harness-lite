import { expectTypeOf, test } from 'vitest'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'
import type { CallKey as SharedCallKey, CreationKey } from '@omne-harness-lite/messages'
import type { CallKey } from '@omne-harness-lite/model-request-runtime'
import type { CallConsumer, AcquireCallInput } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelRuntimeOperations,
  OpenCallInput,
  SettleReplyInput,
} from '@omne-harness-lite/model-request-runtime'

test('D110 keeps one shared identity and independent consumer controls', () => {
  expectTypeOf<CallKey>().toEqualTypeOf<SharedCallKey>()
  expectTypeOf<OpenCallInput['creationKey']>().toEqualTypeOf<CreationKey>()
  expectTypeOf<keyof CallConsumer>().toEqualTypeOf<'wait' | 'release' | 'stopped'>()
  expectTypeOf<Parameters<ModelRuntimeOperations['acquireCall']>>().toEqualTypeOf<
    [AcquireCallInput]
  >()
  expectTypeOf<SettleReplyInput['disposition']>().toEqualTypeOf<
    Exclude<ReplyDisposition, 'persisted'>
  >()
})
