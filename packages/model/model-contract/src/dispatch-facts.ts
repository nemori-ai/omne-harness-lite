import type {
  Access,
  Adoption,
  ConsumerRef,
  ContextWindow,
  DispatchId,
  ModelCallId,
  Supplier,
} from './root.ts'
import type { CallAccount } from '@omne-harness/call-account'
import type { ModelFault, Reply } from './result.ts'
import type { DispatchInstants } from './call-surface.ts'
import type { CostLookupState } from './cost-lookup.ts'

/** One real dispatch as Model shows it outside: numbers and identities only, never a body. */
export type ModelDispatchFact = Readonly<{
  call: ModelCallId
  dispatch: DispatchId
  consumer: ConsumerRef
  profile: Adoption
  supplier: Supplier
  contextWindow: ContextWindow | null
  instants: DispatchInstants
  send: 'not-sent' | 'sent' | 'unknown'
  outcome:
    | Readonly<{ kind: 'pending' }>
    | Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }>
    | Readonly<{ kind: 'interrupted' }>
    | Readonly<{ kind: 'failed'; cause: ModelFault['cause']; upstreamStatus: string | null }>
  connectRetries: number
  account: CallAccount | null
  costLookup: CostLookupState
}>
export type ModelDispatchFactsQuery = Readonly<{
  /** By the prepared moment, both ends included; null takes every dated dispatch. */
  range: Readonly<{ from: string; to: string }> | null
  /** Dispatches whose consumer has this owner and a work equal to one of `works` or under it. */
  consumer: Readonly<{ owner: string; works: readonly string[] }> | null
  order: 'ascending' | 'descending'
  /** The `next` of the previous page of the same query; opaque. */
  after: string | null
  limit: number
}>
export type ModelDispatchFactsPage = Readonly<{
  entries: readonly ModelDispatchFact[]
  /** Dispatches in the consumer scope that have no prepared moment and so are in no range. */
  undated: number
  next: string | null
}>
export interface ModelDispatchFacts<P> {
  list(input: Access<P> & ModelDispatchFactsQuery): Reply<ModelDispatchFactsPage>
}
