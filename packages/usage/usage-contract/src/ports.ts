import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { UsageConsumer, UsageFact, UsageInstant, UsageQuery, UsageResult } from './values.ts'

/** What a failure of a query depends on: a registered source by its name, or the session scope. */
export type UsageDependency =
  | Readonly<{ kind: 'source'; name: string }>
  | Readonly<{ kind: 'session-scope' }>

export type UsageFailure =
  | Readonly<{
      kind: 'invalid'
      field: 'scope' | 'range' | 'zone' | 'bucket' | 'groupBy'
      reason: string
    }>
  | Readonly<{ kind: 'unsupported'; field: 'scope' }>
  | Readonly<{ kind: 'not-found'; what: 'session' }>
  | Readonly<{ kind: 'denied'; dependency: UsageDependency }>
  | Readonly<{ kind: 'unavailable'; dependency: UsageDependency; diagnostic: string }>
  | Readonly<{ kind: 'too-large'; limit: 'buckets' | 'pages' }>

export type UsageReply<T> = Promise<Outcome<T, UsageFailure>>

/** How a source or the session scope fails: it refuses this principal, or it cannot answer now. */
export type UsagePortFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** One page of a source, ascending by instant; `undated` counts the units in scope with no instant. */
export type UsageSourcePage = Readonly<{
  entries: readonly UsageFact[]
  undated: number
  next: string | null
}>

/** A source of usage facts: one per producer, read page by page within its own limits. */
export interface UsageSource<P> {
  readonly name: string
  readonly limits: Readonly<{ page: number; works: number }>
  list(
    input: Access<P> &
      Readonly<{
        /** Both ends included. */
        range: Readonly<{ from: UsageInstant; to: UsageInstant }>
        consumer: UsageConsumer | null
        after: string | null
        limit: number
      }>,
  ): Promise<Outcome<UsageSourcePage, UsagePortFailure>>
}

/** A session as consumer scopes, one per owner of its work. A session of another tenant is absent. */
export interface UsageSessionScope<P> {
  resolve(
    input: Access<P> & Readonly<{ session: string }>,
  ): Promise<
    Outcome<
      | Readonly<{ kind: 'found'; consumers: readonly UsageConsumer[] }>
      | Readonly<{ kind: 'absent' }>,
      UsagePortFailure
    >
  >
}

export interface Usage<P> {
  query(input: Access<P> & UsageQuery): UsageReply<UsageResult>
}
