import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ContextBlockKey, UpdateOriginRef, ScopeRef, StepRef } from './shared.js'
import type { DescriptorCatalog } from './descriptor.js'
import type { ContextUpdate, StepBlockMaterial } from './update.js'
import { validate, SynchronousSchemaRequired } from './validation.js'
export type UpdateRejection =
  | Readonly<{ kind: 'definition'; reason: 'schema-not-synchronous'; path: readonly string[] }>
  | Readonly<{
      kind: 'unauthorized'
      cause: 'not-a-stateful-block' | 'writer-not-allowed' | 'single-writer'
      first?: UpdateOriginRef
    }>
  | Readonly<{ kind: 'shape'; issues: readonly StandardSchemaV1.Issue[] }>
export type RejectedUpdate = Readonly<{ update: ContextUpdate; rejection: UpdateRejection }>
export type ReduceStepInput = Readonly<{
  scope: ScopeRef
  step: StepRef
  updates: readonly ContextUpdate[]
  descriptors: DescriptorCatalog
  current: (key: ContextBlockKey) => unknown
}>
export type ReduceStepResult = Readonly<{
  committed: readonly StepBlockMaterial[]
  rejected: readonly RejectedUpdate[]
}>
export function reduceStep(input: ReduceStepInput): ReduceStepResult {
  const committed = new Map<ContextBlockKey, StepBlockMaterial>()
  const rejected: RejectedUpdate[] = []
  for (const update of input.updates) {
    const descriptor = input.descriptors.get(update.key)
    const reject = (rejection: UpdateRejection) => rejected.push({ update, rejection })
    if (descriptor?.kind !== 'stateful') {
      reject({ kind: 'unauthorized', cause: 'not-a-stateful-block' })
      continue
    }
    if (!descriptor.writers.includes(update.writer)) {
      reject({ kind: 'unauthorized', cause: 'writer-not-allowed' })
      continue
    }
    const previous = committed.get(update.key)
    const first = previous?.updates[0]
    if (descriptor.singleWriterPerStep && first && first.origin.origin !== update.origin.origin) {
      reject({ kind: 'unauthorized', cause: 'single-writer', first: first.origin })
      continue
    }
    if (descriptor.updateSchema) {
      let issues: readonly StandardSchemaV1.Issue[]
      try {
        issues = validate(descriptor.updateSchema, update.update)
      } catch (error) {
        if (error instanceof SynchronousSchemaRequired) {
          reject({ kind: 'definition', reason: 'schema-not-synchronous', path: ['updateSchema'] })
          continue
        }
        throw error
      }
      if (issues.length) {
        reject({ kind: 'shape', issues })
        continue
      }
    }
    const value = descriptor.reduce(
      previous ? previous.value : input.current(update.key),
      update.update,
    )
    let issues: readonly StandardSchemaV1.Issue[]
    try {
      issues = validate(descriptor.schema, value)
    } catch (error) {
      if (error instanceof SynchronousSchemaRequired) {
        reject({ kind: 'definition', reason: 'schema-not-synchronous', path: ['schema'] })
        continue
      }
      throw error
    }
    if (issues.length) {
      reject({ kind: 'shape', issues })
      continue
    }
    committed.set(update.key, {
      key: update.key,
      value,
      updates: [...(previous?.updates ?? []), update],
    })
  }
  return { committed: [...committed.values()], rejected }
}
