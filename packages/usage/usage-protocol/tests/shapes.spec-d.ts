import { expectTypeOf, test } from 'vitest'
import type { Codec, TenantId } from '@omne-harness/public-contract'
import { type UsageProtocol } from '@omne-harness/usage-protocol'
import type { Instant } from '@omne-harness/utc-instant'

type Operations = UsageProtocol['operations']
type ValueOf<C> = C extends Codec<infer T> ? T : never

test('the protocol is usage major 1 with three reads and no observation', () => {
  expectTypeOf<UsageProtocol['name']>().toEqualTypeOf<'usage'>()
  expectTypeOf<UsageProtocol['major']>().toEqualTypeOf<1>()
  expectTypeOf<keyof Operations>().toEqualTypeOf<
    'query-usage' | 'list-usage-records' | 'read-context-occupancy'
  >()
  expectTypeOf<keyof UsageProtocol['observations']>().toEqualTypeOf<never>()
})

test('a query names its tenant, one of three scopes and a range of instants', () => {
  type Body = ValueOf<Operations['query-usage']['body']>
  expectTypeOf<Body['tenant']>().toEqualTypeOf<TenantId>()
  expectTypeOf<Body['scope']>().toEqualTypeOf<
    | { readonly kind: 'tenant' }
    | { readonly kind: 'session'; readonly session: string }
    | { readonly kind: 'organization' }
  >()
  expectTypeOf<Body['range']>().toEqualTypeOf<{ readonly from: Instant; readonly to: Instant }>()
})

test('the occupancy answers known with the moment and model, none yet, or unknown with a reason', () => {
  type Answer = ValueOf<Operations['read-context-occupancy']['outcomes']['succeeded']>
  expectTypeOf<Extract<Answer, { kind: 'known' }>['asOf']>().toEqualTypeOf<{
    readonly at: Instant
    readonly model: string | null
  }>()
  expectTypeOf<Exclude<Answer, { kind: 'known' }>>().toEqualTypeOf<
    | { readonly kind: 'none-yet' }
    | { readonly kind: 'unknown'; readonly reason: 'usage-unknown' | 'window-unknown' }
  >()
})
