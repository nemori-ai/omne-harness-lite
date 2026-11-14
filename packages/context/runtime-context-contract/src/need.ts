import type { ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockValue } from './shared.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type Necessity = 'required' | 'optional'

export type ContextNeed<T = unknown> = Readonly<{
  name: string
  shape: StandardSchemaV1<unknown, T>
  consumer: ConsumerClass
  purpose: string
  necessity: Necessity
}>

export type Translation<V, T> = (value: V) => T

export type NeedBinding<K extends ContextBlockKey = ContextBlockKey, T = unknown> =
  | Readonly<{ need: ContextNeed<T>; key: K; translate?: undefined }>
  | Readonly<{
      need: ContextNeed<T>
      key: K
      translate: Translation<BlockValue<K>, T>
      integrator: ConsumerClass
    }>

export type NeedBindingRef = Readonly<{ need: string; key: ContextBlockKey }>
