import { expectTypeOf, test } from 'vitest'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'
import type { CallKey as SharedCallKey, CreationKey } from '@omne-harness-lite/messages'
import type { CallKey } from '../src/reference-types.ts'
import type { CallConsumer, AcquireCallInput } from '@omne-harness-lite/model-request-runtime'
import type {
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
    Exclude<ReplyDisposition, 'persisted'>
  >()
})
