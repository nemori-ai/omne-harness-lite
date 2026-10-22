import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockValue, StepRef, UpdateOriginRef } from './shared.js'

export type ContextUpdate<K extends ContextBlockKey = ContextBlockKey, U = unknown> = Readonly<{
  origin: UpdateOriginRef
  key: K
  update: U
  /** The class of the proposer; must be within the descriptor's writers (RC-05). */
  writer: ConsumerClass
}>

/** One stateful block after the step's accepted updates were reduced: the full value, not the delta. */
export type StepBlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  key: K
  value: BlockValue<K>
  /** The updates folded into `value`, in arrival order; empty when the material is a recovery hand-back (RC-07). */
  updates: readonly ContextUpdate<K>[]
}>

export type StepCommit = Readonly<{
  scope: ScopeRef
  step: StepRef
  /** Only what `reduceStep` accepted (RC-05). */
  committed: readonly StepBlockMaterial[]
  /** Updates of successful actions of a failed step, kept by the holder; never applied by this member (RC-05). */
  pending: readonly ContextUpdate[]
}>
