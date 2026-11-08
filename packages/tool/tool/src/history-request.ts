import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { ToolState } from '@omne-harness/tool-contract'
import type { CurrentCallRecord } from './ledger-store.ts'

export type {
  HistoricalFixedToolRequest,
  HistoricalReturns,
} from '@omne-harness/tool-contract/provider'
import type { HistoricalFixedToolRequest } from '@omne-harness/tool-contract/provider'
export type HistoricalCallRecord = Omit<
  CurrentCallRecord,
  'requestFormat' | 'request' | 'state' | 'preparations'
> &
  Readonly<{
    requestFormat: 'historical-result'
    request: HistoricalFixedToolRequest
    state: Extract<ToolState, { phase: 'settled' }>
    preparations: readonly (Omit<CurrentCallRecord['preparations'][number], 'request'> &
      Readonly<{ request: HistoricalFixedToolRequest }>)[]
  }>
export function historicalExecutionUnavailable(
  call: HistoricalCallRecord,
): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unsupported',
    adoption: call.request.availability.definition.adoption,
    reason: 'historical result does not provide a current execution request',
  })
}
