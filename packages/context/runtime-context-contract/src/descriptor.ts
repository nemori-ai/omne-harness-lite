import { createHash } from 'node:crypto'
import type { ContextBlockKey, ConsumerClass } from './shared.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export interface BlockDescriptorBase<K extends ContextBlockKey, V> {
  readonly key: K
  readonly schema: StandardSchemaV1<unknown, V>
  readonly consumers: readonly ConsumerClass[]
  readonly required: boolean
  readonly disclosure: 'plain' | 'eligibility-checked'
  readonly carriesPrevious: boolean
  readonly volatility: 'stable' | 'per-step' | 'per-request'
  readonly parameterSchema?: StandardSchemaV1<unknown, unknown>
}

export interface SuppliedBlockDescriptor<K extends ContextBlockKey, V> extends BlockDescriptorBase<
  K,
  V
> {
  readonly kind: 'supplied'
  readonly recovery: 'persisted' | 'reread' | 'recompute'
}

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
