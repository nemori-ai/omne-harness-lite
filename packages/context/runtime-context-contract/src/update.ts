import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockValue, StepRef, UpdateOriginRef } from './shared.js'

export type ContextUpdate<K extends ContextBlockKey = ContextBlockKey, U = unknown> = Readonly<{
  origin: UpdateOriginRef
  key: K
  update: U
  writer: ConsumerClass
}>

export type StepBlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  key: K
  value: BlockValue<K>
  updates: readonly ContextUpdate<K>[]
}>

export type StepCommit = Readonly<{
  scope: ScopeRef
  step: StepRef
  committed: readonly StepBlockMaterial[]
  pending: readonly ContextUpdate[]
}>
