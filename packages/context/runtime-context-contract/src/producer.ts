import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, ContextBlockKey } from './shared.js'
import type { SuppliedBlockDescriptor } from './descriptor.js'
import type { BlockValue, BlockRevision, Generation, ProducerRef } from './shared.js'
import type { CheckUnavailable, CheckUnknown } from './authority.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type SupplyAnswer<V> =
  | Readonly<{ kind: 'value'; value: V }>
  /** The source has no value for this scope; optional reads as none, required as missing (RC-07). */
  | Readonly<{ kind: 'none' }>
  /** The authoritative source answered that it is unavailable: missing (RC-07). */
  | Readonly<{ kind: 'unavailable' }>
  /** The source refuses this supply: the whole read is unauthorized (RC-07). */
  | Readonly<{ kind: 'refused' }>
  /** The source cannot tell: unknown (`source-unknown`) (RC-07). */
  | Readonly<{ kind: 'unknown' }>

/** What one supply call receives: the captured scope and tenant, and the on-behalf principal of this supply. */
export type SupplyInput<P = unknown> = Readonly<{ scope: ScopeRef; tenant: TenantId; principal: P }>

/** The supply callback of a scope-independent block or a per-request block. A throw, a timeout or an unrecognized answer reads as unknown. */
export type SupplyCallback<V, P = unknown> = (input: SupplyInput<P>) => Promise<SupplyAnswer<V>>

/** One tenant's registration of one supplied block. The producer slot is tenant plus key (RC-07). */
export type ProducerRegistration<
  K extends ContextBlockKey = ContextBlockKey,
  P = unknown,
> = Readonly<{
  key: K
  tenant: TenantId
  producer: ProducerRef
}> &
  (
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & { volatility: 'per-request' }
        scoped: boolean
        supply: SupplyCallback<BlockValue<K>, P>
      }>
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
          volatility: 'stable' | 'per-step'
        }
        scoped: false
        supply: SupplyCallback<BlockValue<K>, P>
      }>
    | Readonly<{
        declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
          volatility: 'stable' | 'per-step'
        }
        scoped: true
        supply?: SupplyCallback<BlockValue<K>, P>
      }>
  )

/** Refusals a publication or an invalidation reveals only after authorization (RC-07). */
type HandleRejection =
  | 'stale-generation'
  | 'withdrawn'
  | 'closed'
  | 'scope-unregistered'
  | 'scope-ended'
  | 'replay-incomplete'

export type PublishResult =
  | Readonly<{ kind: 'published'; scope: ScopeRef; revision: BlockRevision }>
  /** Value not of the declared shape: current value and revision unchanged (RC-07). */
  | Readonly<{ kind: 'rejected'; reason: 'shape'; issues: readonly StandardSchemaV1.Issue[] }>
  /** A late publication of an old generation is not adopted (RC-07). */
  | Readonly<{ kind: 'rejected'; reason: HandleRejection }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' }>
  | CheckUnavailable
  | CheckUnknown

export type InvalidateResult =
  | Readonly<{ kind: 'invalidated'; scopes: readonly ScopeRef[] }>
  | Readonly<{ kind: 'rejected'; reason: HandleRejection }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' }>
  | CheckUnavailable
  | CheckUnknown

/** One scope of the handle's tenant, or every scope of it (RC-07). */
export type InvalidateTarget =
  | Readonly<{ kind: 'scope'; scope: ScopeRef; tenant: TenantId }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>

export type PublishInput = Readonly<{ scope: ScopeRef; tenant: TenantId; value: unknown }>

export interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
  readonly key: K
  readonly tenant: TenantId
  readonly producer: ProducerRef
  readonly generation: Generation
  /** Every publication names the scope and the tenant; one scope's publication changes no other scope's value (RC-07). */
  publish(input: PublishInput): Promise<PublishResult>
  /** Makes the current value missing (optional: none); the view revision advances. A tenant target never reaches another tenant's scope. */
  invalidate(target: InvalidateTarget): Promise<InvalidateResult>
  /** Withdraws this generation only; a generation already replaced changes nothing (RC-07). Idempotent. */
  dispose(): Promise<void>
}
