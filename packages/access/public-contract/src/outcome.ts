/**
 * The public outcomes. Access owns this closed set (RFC-0015 §3); every protocol answers
 * with one of them, and the binding page maps each to one status code.
 */
export const OUTCOMES = Object.freeze([
  'succeeded',
  'no-change',
  'not-committed',
  'need-decision',
  'protocol-rejected',
  'invalid',
  'uniform-auth-failure',
  'denied',
  'not-loginable',
  'not-visible',
  'not-found',
  'conflict',
  'archived',
  'frozen',
  'limited',
  'unsupported',
  'not-writable',
  'stage-not-provided',
  'basis-unavailable',
  'unknown',
] as const)

export type Outcome = (typeof OUTCOMES)[number]

/**
 * The outcomes whose body is always the empty object. The pipeline answers the first four for
 * the domain; the other two are fixed so that refusals stay uniform (RFC-0015 I-13).
 */
export type FixedOutcome =
  | 'denied'
  | 'protocol-rejected'
  | 'basis-unavailable'
  | 'unknown'
  | 'uniform-auth-failure'
  | 'stage-not-provided'
