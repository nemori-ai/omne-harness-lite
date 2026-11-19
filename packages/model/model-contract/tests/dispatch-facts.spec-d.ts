import { expectTypeOf, it } from 'vitest'
import type {
  ContextWindow,
  CostLookupState,
  FixedModelRequest,
  ModelDispatchFact,
  ModelDispatchFacts,
  ModelDispatchFactsPage,
  ModelDispatchFactsQuery,
} from '@omne-harness/model-contract'

it('a dispatch fact names the call, the consumer and the adoptions, and carries no body', () => {
  expectTypeOf<keyof ModelDispatchFact>().toEqualTypeOf<
    | 'call'
    | 'dispatch'
    | 'consumer'
    | 'profile'
    | 'supplier'
    | 'contextWindow'
    | 'instants'
    | 'send'
    | 'outcome'
    | 'connectRetries'
    | 'account'
    | 'costLookup'
  >()
  expectTypeOf<ModelDispatchFact['costLookup']>().toEqualTypeOf<CostLookupState>()
  expectTypeOf<CostLookupState>().toEqualTypeOf<
    'not-needed' | 'pending' | 'found' | 'not-found' | 'no-request-id'
  >()
  expectTypeOf<ModelDispatchFact['contextWindow']>().toEqualTypeOf<ContextWindow | null>()
  expectTypeOf<FixedModelRequest['contextWindow']>().toEqualTypeOf<ContextWindow | undefined>()
})

it('the read takes a query and answers a page with the undated count', () => {
  expectTypeOf<ModelDispatchFactsQuery['order']>().toEqualTypeOf<'ascending' | 'descending'>()
  expectTypeOf<ModelDispatchFactsPage['undated']>().toEqualTypeOf<number>()
  expectTypeOf<
    Parameters<ModelDispatchFacts<unknown>['list']>[0]
  >().toMatchTypeOf<ModelDispatchFactsQuery>()
})
