import { expectTypeOf, test } from 'vitest'
import type { Codec, TenantId } from '@omne-harness/public-contract'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
  type HumanInterventionReplyResult,
} from '@omne-harness/human-intervention-protocol'

type Operations = HumanInterventionProtocol['operations']
type Name = keyof Operations
type ValueOf<C> = C extends Codec<infer T> ? T : never
type BodyOf<N extends Name> = Operations[N] extends { readonly body: infer B } ? ValueOf<B> : never
type Outcomes<N extends Name> = Operations[N]['outcomes']

test('the operations are exactly the four of human-intervention/v1', () => {
  expectTypeOf<Name>().toEqualTypeOf<
    'list-cards' | 'read-card' | 'submit-reply' | 'query-submit-reply'
  >()
  expectTypeOf(humanInterventionProtocol.name).toEqualTypeOf<'human-intervention'>()
  expectTypeOf(humanInterventionProtocol.major).toEqualTypeOf<1>()
})

test('the bodies carry the tenant, and a submission carries a reply and its id', () => {
  expectTypeOf<BodyOf<'list-cards'>['tenant']>().toEqualTypeOf<TenantId>()
  expectTypeOf<BodyOf<'list-cards'>['cursor']>().toEqualTypeOf<string | null>()
  expectTypeOf<BodyOf<'read-card'>['tenant']>().toEqualTypeOf<TenantId>()
  expectTypeOf<BodyOf<'submit-reply'>>().toEqualTypeOf<BodyOf<'query-submit-reply'>>()
  expectTypeOf<BodyOf<'submit-reply'>['replyId']>().toEqualTypeOf<string>()
  expectTypeOf<BodyOf<'submit-reply'>['reply']['kind']>().toEqualTypeOf<
    'selection' | 'text' | 'decline'
  >()
})

test('both submit operations succeed with the same reply result', () => {
  expectTypeOf<
    ValueOf<Outcomes<'submit-reply'>['succeeded']>
  >().toEqualTypeOf<HumanInterventionReplyResult>()
  expectTypeOf<
    ValueOf<Outcomes<'query-submit-reply'>['succeeded']>
  >().toEqualTypeOf<HumanInterventionReplyResult>()
  expectTypeOf<HumanInterventionReplyResult['kind']>().toEqualTypeOf<
    'decided' | 'already-decided' | 'invalidated'
  >()
})
