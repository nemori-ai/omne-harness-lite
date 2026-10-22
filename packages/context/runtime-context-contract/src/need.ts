import type { ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockValue } from './shared.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type Necessity = 'required' | 'optional'

/** One line in a consumer's own definition: "I need a value of this shape". Names no block key. */
export type ContextNeed<T = unknown> = Readonly<{
  /** Identity inside the consumer definition; a binding is identified by need plus key. */
  name: string
  shape: StandardSchemaV1<unknown, T>
  consumer: ConsumerClass
  purpose: string
  necessity: Necessity
}>

/** Pure function owned by the integrator. It may throw; a throw reads as `missing` (RC-06, F-RC05). */
export type Translation<V, T> = (value: V) => T

export type NeedBinding<K extends ContextBlockKey = ContextBlockKey, T = unknown> =
  | Readonly<{ need: ContextNeed<T>; key: K; translate?: undefined }>
  | Readonly<{
      need: ContextNeed<T>
      key: K
      translate: Translation<BlockValue<K>, T>
      /** The integrator's own consumer class; the source block is checked against it (RC-06). */
      integrator: ConsumerClass
    }>

/** How an eligibility names a binding of its allowed set: need plus key (object model). */
export type NeedBindingRef = Readonly<{ need: string; key: ContextBlockKey }>
