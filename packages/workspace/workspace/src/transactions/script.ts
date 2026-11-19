import type { Json, OperationKind } from '@omne-harness/workspace-contract'
import type { WorkspaceTxn } from '../txn.ts'

/** What every command with an effect carries: whose it is, its name, and a digest of its input. */
export type Named = Readonly<{ tenant: string; operation: string; digest: string }>

/**
 * What a script decided. `recalled` says the operation had been done before and its first value
 * is returned. `stale` says the facts the caller decided on have changed since it read them.
 */
export type ScriptResult<T extends Json> =
  | Readonly<{ kind: 'done'; value: T; changed: boolean }>
  | Readonly<{ kind: 'not-permitted' }>
  | Readonly<{ kind: 'not-performed'; reason: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'stale' }>

/**
 * Runs an effect at most once per operation name. The same name with the same input returns
 * what was done the first time; with another input it is a conflict. Only done effects are kept.
 */
export function once<T extends Json>(
  txn: WorkspaceTxn,
  command: Named,
  kind: OperationKind,
  effect: () => ScriptResult<T>,
): ScriptResult<T> {
  const recorded = txn.operation(command.tenant, command.operation)
  if (recorded !== null) {
    if (recorded.kind !== kind || recorded.digest !== command.digest) return { kind: 'conflict' }
    return { kind: 'done', value: recorded.value as T, changed: false }
  }
  const result = effect()
  if (result.kind === 'done')
    txn.insertOperation({
      tenant: command.tenant,
      operation: command.operation,
      kind,
      digest: command.digest,
      value: result.value,
    })
  return result
}
