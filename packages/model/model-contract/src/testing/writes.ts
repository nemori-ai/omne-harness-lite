import { isDeepStrictEqual } from 'node:util'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelFailure } from '../index.ts'
import type { ModelCallId, ModelOperationId } from '../root.ts'
import { mintRevision } from './mint.ts'
import { scoped, type CallRecord, type Core, type OperationEntry } from './core.ts'

export type WriteAction = 'admit' | 'cancel' | 'acknowledge'

export type WriteTarget = Readonly<{
  scope: string
  action: WriteAction
  call: ModelCallId
  operation: ModelOperationId
}>

export function writeOf(
  scope: string,
  action: WriteAction,
  input: Readonly<{ call: ModelCallId; operation: ModelOperationId }>,
): WriteTarget {
  return { scope, action, call: input.call, operation: input.operation }
}

export function unknownKey(
  scope: string,
  action: WriteAction,
  operation: ModelOperationId,
): string {
  return JSON.stringify([scope, action, operation])
}

export function performWrite<P, T>(
  core: Core<P>,
  { scope, action, call, operation }: WriteTarget,
  apply: () => T,
): Outcome<T, ModelFailure> {
  const key = unknownKey(scope, action, operation)
  const script = core.unknownWrites.get(key)
  if (script === undefined) return succeed(apply())
  core.unknownWrites.delete(key)
  if (script.effect === 'applied') apply()
  if (script.query === 'stays-unknown') core.heldQueries.set(scoped(scope, operation), call)
  return fail({ kind: 'commit-unknown', operation })
}

export function conflictOf<P>(
  operation: ModelOperationId,
  record: CallRecord<P>,
): Outcome<never, ModelFailure> {
  return fail({ kind: 'conflict', operation, revision: mintRevision(record.revision) })
}

export function sameParameters<P>(known: OperationEntry<P>, parameters: unknown): boolean {
  return isDeepStrictEqual(known.parameters, parameters)
}

export function remember<P>(
  core: Core<P>,
  scope: string,
  operation: ModelOperationId,
  record: CallRecord<P>,
  parameters: unknown,
): void {
  core.operations.set(scoped(scope, operation), {
    record,
    parameters: structuredClone(parameters),
    revision: record.revision,
  })
}
