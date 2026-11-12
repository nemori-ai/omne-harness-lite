import type { Origin } from '@omne-harness/human-intervention'
import type { SqlCell } from '@omne-harness/sql-contract/worker'
import { readStringCell, stringCell } from './string-cell.ts'

/** 来源的种类和可选引用，按表列顺序：origin_kind、session_ref、run_ref、tool_call_ref。 */
export function originCells(origin: Origin) {
  const optional = (value: string | undefined) => (value === undefined ? null : stringCell(value))
  return [
    origin.kind,
    optional(origin.sessionRef),
    optional(origin.runRef),
    optional('toolCallRef' in origin ? origin.toolCallRef : undefined),
  ] as const
}

/** 从表列读回可选引用。空列不产生字段，读回的值与原来源逐字段相等。 */
export function originRefs(cells: readonly SqlCell[]) {
  const [session, run, toolCall] = cells
  return {
    ...(session === null ? {} : { sessionRef: readStringCell(session) }),
    ...(run === null ? {} : { runRef: readStringCell(run) }),
    ...(toolCall === null ? {} : { toolCallRef: readStringCell(toolCall) }),
  }
}
