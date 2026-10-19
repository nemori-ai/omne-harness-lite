// How an author maps a supplier's refusal into the fault of the contract. The supplier of this
// example signals that an input is too long with its own error code. The status code is evidence
// and does not decide: a 400 with another code is not an over-limit refusal. The report holds what
// the supplier gave and nothing else, so a figure that it left out stays null and is never
// filled in from a local count.
import type { ModelFault, TransportTermination } from '@omne-harness/model-contract'

export type SupplierRefusal = Readonly<{
  status: number
  body: Readonly<{ code: string; message: string; limit?: number; actual?: number }>
}>

const OVER_LIMIT_CODE = 'context_length_exceeded'

const figure = (value: number | undefined): string | null =>
  value === undefined ? null : String(value)

function faultOf(refusal: SupplierRefusal): ModelFault {
  const common = { diagnostic: refusal.body.message, upstreamStatus: String(refusal.status) }
  if (refusal.body.code === OVER_LIMIT_CODE)
    return {
      ...common,
      cause: 'input-over-limit',
      reported: {
        metric: refusal.body.limit === undefined ? null : 'context-tokens',
        limit: figure(refusal.body.limit),
        actual: figure(refusal.body.actual),
      },
    }
  if (refusal.status === 401 || refusal.status === 403) return { ...common, cause: 'credential' }
  if (refusal.status === 429 || refusal.status >= 500)
    return { ...common, cause: 'upstream-unavailable' }
  if (refusal.status >= 400) return { ...common, cause: 'input-rejected' }
  return { ...common, cause: 'unclassified' }
}

/** The termination that closes the stream after the supplier refused the request. */
export function terminationOfRefusal(refusal: SupplierRefusal): TransportTermination {
  return { kind: 'failed', fault: faultOf(refusal) }
}
