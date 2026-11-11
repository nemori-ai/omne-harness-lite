import { sameFactValue } from './evidence.ts'
import type { ToolStartRecord } from '@omne-harness/tool-contract'

import type { CallRecord } from './ledger-store.ts'

export function currentBodyExecution(call: CallRecord, start: ToolStartRecord): boolean {
  const execution =
    call.execution ?? (call.state.phase === 'starting' ? call.start?.execution : null)
  return execution !== null && execution !== undefined && sameFactValue(execution, start.execution)
}
