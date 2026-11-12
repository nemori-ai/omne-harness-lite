// The status code of each outcome (binding page「状态码映射」), the only copy in the repository. The
// key is the shared contract's closed `Outcome`, so a missing row fails the type check. The three
// existing locations read it through `../status.ts`; the new address reads it here.
import type { Outcome } from '@omne-harness/public-contract'

export const STATUS_BY_OUTCOME: Readonly<Record<Outcome, number>> = Object.freeze({
  succeeded: 200,
  limited: 429,
  'no-change': 200,
  'not-committed': 200,
  'need-decision': 202,
  'protocol-rejected': 400,
  invalid: 422,
  'uniform-auth-failure': 401,
  denied: 403,
  'not-loginable': 403,
  'not-visible': 404,
  'not-found': 404,
  conflict: 409,
  archived: 409,
  frozen: 409,
  unsupported: 501,
  'not-writable': 501,
  'stage-not-provided': 501,
  'basis-unavailable': 503,
  unknown: 500,
})
