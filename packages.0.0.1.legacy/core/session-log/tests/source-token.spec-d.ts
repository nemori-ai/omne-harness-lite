import { expectTypeOf } from 'vitest'
import {
  checkSourceToken,
  sourceTokenEquals,
  type JsonNumber,
  type SessionRef,
  type SourceToken,
  type TenantId,
} from '@omne-harness-lite/session-log'

expectTypeOf<SourceToken['tenant']>().toEqualTypeOf<TenantId>()
expectTypeOf<SourceToken['session']>().toEqualTypeOf<SessionRef>()
expectTypeOf<SourceToken['tail']>().toEqualTypeOf<JsonNumber>()
expectTypeOf<keyof SourceToken>().toEqualTypeOf<
  'tenant' | 'session' | 'journalGeneration' | 'tail'
>()
expectTypeOf(checkSourceToken).parameter(0).toEqualTypeOf<unknown>()
expectTypeOf(sourceTokenEquals).returns.toEqualTypeOf<boolean>()

const checked = checkSourceToken(null)
if (!('failure' in checked)) {
  // @ts-expect-error A validated coordinate cannot be mutated by its consumer.
  checked.ok.tail = 1
  // @ts-expect-error Tenant components remain immutable at the public boundary.
  checked.ok.tenant.account = 'another-account'
}
