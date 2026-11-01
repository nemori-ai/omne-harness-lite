// The status code of each public outcome (binding page「状态码映射」). The key type is the union of
// every outcome the public contract can encode, so a missing row fails the type check.
import type { GovernanceResponse, SessionResponse } from '@omne-harness/public-contract'

export type PublicOutcome = GovernanceResponse['outcome'] | SessionResponse['outcome']

export const STATUS_BY_OUTCOME: Readonly<Record<PublicOutcome, number>> = Object.freeze({
  succeeded: 200,
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
  'stage-not-provided': 501,
  'basis-unavailable': 503,
  unknown: 500,
})
