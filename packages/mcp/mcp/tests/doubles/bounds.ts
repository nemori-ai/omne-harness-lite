import type { BoundKind } from '../../src/internal/port.ts'
import type { TableRuntime } from '../../src/internal/table.ts'

export type ManualBounds = Readonly<{
  runtime: TableRuntime
  started(): readonly BoundKind[]
  fire(kind: BoundKind, nth?: number): void
}>

export function manualBounds(afterExit?: (error: unknown) => void): ManualBounds {
  const bounds: { kind: BoundKind; controller: AbortController }[] = []
  return {
    runtime: {
      ...(afterExit === undefined ? {} : { afterExit }),
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
