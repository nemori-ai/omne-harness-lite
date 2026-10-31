import { createHash } from 'node:crypto'
import type { ContextBlockKey, ConsumerClass } from './shared.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

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
  readonly updateSchema?: StandardSchemaV1<unknown, U>
  readonly kind: 'stateful'
  readonly writers: readonly ConsumerClass[]
  readonly reduce: (current: V | undefined, update: U) => V
  readonly persistence: 'checkpointed' | 'untracked'
  readonly singleWriterPerStep: boolean
}

export type ContextBlockDescriptor<K extends ContextBlockKey, V, U = V> =
  | SuppliedBlockDescriptor<K, V>
  | StatefulBlockDescriptor<K, V, U>

export type DescriptorCatalog = Readonly<{
  get(key: ContextBlockKey): ContextBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined
}>

/** Stable comparison of declaration metadata. Validator and reducer function bodies are not serializable declaration data. */
export function declarationDigest(
  descriptor: ContextBlockDescriptor<ContextBlockKey, unknown, unknown>,
): string {
  const fields = {
    key: descriptor.key,
    kind: descriptor.kind,
    consumers: [...descriptor.consumers].sort(),
    required: descriptor.required,
    disclosure: descriptor.disclosure,
    carriesPrevious: descriptor.carriesPrevious,
    volatility: descriptor.volatility,
    parameterSchema: descriptor.parameterSchema !== undefined,
    ...(descriptor.kind === 'supplied'
      ? { recovery: descriptor.recovery }
      : {
          writers: [...descriptor.writers].sort(),
          persistence: descriptor.persistence,
          singleWriterPerStep: descriptor.singleWriterPerStep,
          updateSchema: descriptor.updateSchema !== undefined,
        }),
  }
  const sorted = Object.fromEntries(
    Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}
