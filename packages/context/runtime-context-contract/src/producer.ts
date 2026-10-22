import type { ScopeRef, ContextBlockKey } from './shared.js'
import type { SuppliedBlockDescriptor } from './descriptor.js'
import type { BlockValue, BlockRevision, Generation, ProducerRef } from './shared.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type SupplyAnswer<V> =
  | Readonly<{ kind: 'value'; value: V }>
  /** The source has no value for this scope; optional reads as none, required as missing (RC-04, RC-07). */
  | Readonly<{ kind: 'none' }>
  /** The authoritative source answered that it is unavailable: missing (RC-03). */
  | Readonly<{ kind: 'unavailable' }>

/** The per-scope supply callback of a scope-independent block or a per-request block. A throw or a timeout reads as unknown. */
export type SupplyCallback<V> = (scope: ScopeRef) => Promise<SupplyAnswer<V>>

export type ProducerRegistration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  key: K
  producer: ProducerRef
}> &
  (
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & { volatility: 'per-request' }
        scoped: boolean
        supply: SupplyCallback<BlockValue<K>>
      }>
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
          volatility: 'stable' | 'per-step'
        }
        scoped: false
        supply: SupplyCallback<BlockValue<K>>
      }>
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
          volatility: 'stable' | 'per-step'
        }
        scoped: true
        supply?: SupplyCallback<BlockValue<K>>
      }>
  )

export type PublishResult =
  | Readonly<{ kind: 'published'; scope: ScopeRef; revision: BlockRevision }>
  /** Value not of the declared shape: current value and revision unchanged (RC-07). */
  | Readonly<{ kind: 'rejected'; reason: 'shape'; issues: readonly StandardSchemaV1.Issue[] }>
  /** A late publication of an old generation is not adopted (RC-07). */
  | Readonly<{ kind: 'rejected'; reason: 'stale-generation' | 'withdrawn' | 'closed' }>

export type InvalidateResult =
  | Readonly<{ kind: 'invalidated'; scopes: readonly ScopeRef[] }>
  | Readonly<{ kind: 'rejected'; reason: 'stale-generation' | 'withdrawn' | 'closed' }>

export interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
  readonly key: K
  readonly producer: ProducerRef
  readonly generation: Generation
  /** Every publication names the scope; one scope's publication changes no other scope's value (RC-07). */
  publish(scope: ScopeRef, value: unknown): Promise<PublishResult>
  /** Makes the current value missing (optional: none); the view revision advances. Omit the scope for every registered scope of a scope-independent block. */
  invalidate(scope?: ScopeRef): Promise<InvalidateResult>
  /** Withdraws this generation only; a generation already replaced changes nothing (RC-07). Idempotent. */
  dispose(): Promise<void>
}
