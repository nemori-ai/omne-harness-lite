import type { Json, OperationKind, Reason } from '@omne-harness/workspace-contract'
import type { WorkspaceTxn } from '../txn.ts'

/** What every command with an effect carries: whose it is, its name, and a digest of its input. */
export type Named = Readonly<{ tenant: string; operation: string; digest: string }>

/**
 * What a script decided. A `done` with `changed: false` is either the facts already being as
 * asked, or the operation having been done before: its first value is returned.
 */
export type ScriptResult<T extends Json> =
  | Readonly<{ kind: 'done'; value: T; changed: boolean }>
  | Readonly<{ kind: 'not-permitted' }>
  | Readonly<{ kind: 'not-performed'; reason: Reason }>
  | Readonly<{ kind: 'conflict' }>

/** The facts the caller decided on have changed since it read them. The caller reads and decides again. */
export type Stale = Readonly<{ kind: 'stale' }>

/**
 * Runs an effect at most once per operation name. The same name with the same input returns
 * what was done the first time; with another input it is a conflict. Only done effects are kept.
 */
export function once<T extends Json, R extends ScriptResult<T> | Stale>(
  txn: WorkspaceTxn,
  command: Named,
  kind: OperationKind,
  effect: () => R,
): R | ScriptResult<T> {
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
