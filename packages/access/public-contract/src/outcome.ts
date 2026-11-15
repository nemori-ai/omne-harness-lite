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

export type FixedOutcome =
  | 'denied'
  | 'protocol-rejected'
  | 'basis-unavailable'
  | 'unknown'
  | 'uniform-auth-failure'
  | 'stage-not-provided'
