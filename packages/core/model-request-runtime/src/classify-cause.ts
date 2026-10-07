import { ExactDecimal } from '@omne-harness-lite/call-accounts'

import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { Failure } from '@omne-harness-lite/model-response'
import type { TransportFailure, InvocationPolicy } from './invocation-types.ts'

export function classifyCause(
  fact: TransportFailure,
  hasContent: boolean,
  table: InvocationPolicy['statusCauseTable'],
): Failure['cause'] {
  if (hasContent) return 'interrupted_mid_reply'
  if (fact.source === 'connect' || fact.source === 'stream_broken') return 'upstream_unavailable'
  if (fact.source === 'http_status' || fact.source === 'in_band') {
    if (fact.statusCode === undefined) return 'unrecognized'
    const status = ExactDecimal.from(fact.statusCode)
    for (const [key, cause] of Object.entries(table))
      if (status.compare(ExactDecimal.from(new LosslessNumber(key))) === 0) return cause
  }
  return 'unrecognized'
}
