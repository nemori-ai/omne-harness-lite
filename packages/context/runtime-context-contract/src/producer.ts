import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, ContextBlockKey } from './shared.js'
import type { SuppliedBlockDescriptor } from './descriptor.js'
import type { BlockValue, BlockRevision, Generation, ProducerRef } from './shared.js'
import type { CheckUnavailable, CheckUnknown } from './authority.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type SupplyAnswer<V> =
  | Readonly<{ kind: 'value'; value: V }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>

export type SupplyInput<P = unknown> = Readonly<{ scope: ScopeRef; tenant: TenantId; principal: P }>

export type SupplyCallback<V, P = unknown> = (input: SupplyInput<P>) => Promise<SupplyAnswer<V>>

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

type HandleRejection =
  | 'stale-generation'
  | 'withdrawn'
  | 'closed'
  | 'scope-unregistered'
  | 'scope-ended'
  | 'replay-incomplete'

export type PublishResult =
  | Readonly<{ kind: 'published'; scope: ScopeRef; revision: BlockRevision }>
  | Readonly<{ kind: 'rejected'; reason: 'shape'; issues: readonly StandardSchemaV1.Issue[] }>
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

export type InvalidateTarget =
  | Readonly<{ kind: 'scope'; scope: ScopeRef; tenant: TenantId }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>

export type PublishInput = Readonly<{ scope: ScopeRef; tenant: TenantId; value: unknown }>

export interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
  readonly key: K
  readonly tenant: TenantId
  readonly producer: ProducerRef
  readonly generation: Generation
  publish(input: PublishInput): Promise<PublishResult>
  invalidate(target: InvalidateTarget): Promise<InvalidateResult>
  dispose(): Promise<void>
}
