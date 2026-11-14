import type { Origin } from '@omne-harness/human-intervention'
import type { SqlCell } from '@omne-harness/sql-contract/worker'
import { readStringCell, stringCell } from './string-cell.ts'

export function originCells(origin: Origin) {
  const optional = (value: string | undefined) => (value === undefined ? null : stringCell(value))
  return [
    origin.kind,
    optional(origin.sessionRef),
    optional(origin.runRef),
    optional('toolCallRef' in origin ? origin.toolCallRef : undefined),
  ] as const
}

export function originRefs(cells: readonly SqlCell[]) {
  const [session, run, toolCall] = cells
  return {
    ...(session === null ? {} : { sessionRef: readStringCell(session) }),
    ...(run === null ? {} : { runRef: readStringCell(run) }),
    ...(toolCall === null ? {} : { toolCallRef: readStringCell(toolCall) }),
  }
}
