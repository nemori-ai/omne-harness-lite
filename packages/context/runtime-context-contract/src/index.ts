// PACKAGE_TEMPLATE_DRAFT: Shared vocabulary types only (ScopeRef, block keys, block descriptors). The holder, reader, producer and update surfaces are not yet accepted.
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Opaque reference to a holder scope, with an optional parent. Runtime Context does not interpret
 * whether it names a tenant, a session or a run; a child scope reads its own blocks before its parent's.
 */
export type ScopeRef = Readonly<{
  ref: string & { readonly __scope: unique symbol }
  parent?: ScopeRef
}>

/** `<semantic owner domain>.<name>`. One declaration per key in the whole system. */
export type ContextBlockKey = `${string}.${string}`

/** Consumer classes named by a block declaration. Naming a class is not a permission. */
export type ConsumerClass = 'model' | 'tool' | 'extension' | 'coordinator'

/**
 * Key-to-value map of the declared blocks. Each semantic owner adds its keys with
 * `declare module '@omne-harness/runtime-context-contract'`; this package declares none.
 */
export interface ContextBlocks {}

export interface BlockDescriptorBase<K extends ContextBlockKey, V> {
  readonly key: K
  readonly schema: StandardSchemaV1<unknown, V>
  readonly consumers: readonly ConsumerClass[]
  /** Required perception: a missing value reads as missing, not as absent. */
  readonly required: boolean
  readonly disclosure: 'plain' | 'eligibility-checked'
  /** Whether snapshots and reminders may carry the previous value. */
  readonly carriesPrevious: boolean
  /** How often the value is expected to change relative to model steps and requests. */
  readonly volatility: 'stable' | 'per-step' | 'per-request'
  /** Scope-level parameters the holder may give at registration; the declarer owns the shape. */
  readonly parameterSchema?: StandardSchemaV1<unknown, unknown>
}

/** A block whose current value one producer supplies. */
export interface SuppliedBlockDescriptor<K extends ContextBlockKey, V> extends BlockDescriptorBase<
  K,
  V
> {
  readonly kind: 'supplied'
  readonly recovery: 'persisted' | 'reread' | 'recompute'
}

/** A block that participants update and the holder commits at step boundaries. */
export interface StatefulBlockDescriptor<
  K extends ContextBlockKey,
  V,
  U = V,
> extends BlockDescriptorBase<K, V> {
  readonly kind: 'stateful'
  readonly writers: readonly ConsumerClass[]
  readonly reduce: (current: V | undefined, update: U) => V
  readonly persistence: 'checkpointed' | 'untracked'
  readonly singleWriterPerStep: boolean
}

export type ContextBlockDescriptor<K extends ContextBlockKey, V, U = V> =
  | SuppliedBlockDescriptor<K, V>
  | StatefulBlockDescriptor<K, V, U>
