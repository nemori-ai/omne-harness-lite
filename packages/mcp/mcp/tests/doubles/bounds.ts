// Test helper: a table runtime whose bounds fire when the case says so, not on a clock. Each bound
// is recorded with its kind, oldest first, so a case fires the bound of one call and not another.
import type { BoundKind } from '../../src/internal/port.ts'
import { createTaskScope } from '../../src/internal/scope.ts'
import type { TableRuntime } from '../../src/internal/table.ts'

export type ManualBounds = Readonly<{
  runtime: TableRuntime
  /** The kinds of the bounds started so far, oldest first. */
  started(): readonly BoundKind[]
  /** Fires the `nth` bound of `kind` started so far, oldest first. */
  fire(kind: BoundKind, nth?: number): void
}>

export function manualBounds(afterExit?: (error: unknown) => void): ManualBounds {
  const bounds: { kind: BoundKind; controller: AbortController }[] = []
  return {
    runtime: {
      scope: createTaskScope(afterExit),
      startBound: (_milliseconds, kind) => {
        const controller = new AbortController()
        bounds.push({ kind, controller })
        return controller.signal
      },
    },
    started: () => bounds.map(bound => bound.kind),
    fire(kind, nth = 0) {
      const bound = bounds.filter(item => item.kind === kind)[nth]
      if (bound === undefined) throw new Error(`no ${kind} bound #${nth} was started`)
      bound.controller.abort()
    },
  }
}
