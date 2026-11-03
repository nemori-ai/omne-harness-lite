// The closed sets of the contract as code lists. The types are the only source of each set:
// `closed-sets.spec-d.ts` pins every list to its type, and `spec-closed-sets.spec.ts` checks that
// SPEC.md names every member.
import type {
  ContentDefect,
  DegradedReason,
  EndpointBodyRejection,
  KeptReason,
  ListingDefect,
  LostReason,
  NoAnswerCause,
  NotSentReason,
  ProtocolFault,
  Refusal,
  UnavailableReason,
} from '@omne-harness/mcp-contract'
import type { EligibilityVerdict } from '@omne-harness/mcp-contract/provider'

export const ENDPOINT_BODY_REJECTIONS = [
  'malformed',
  'name-mismatch',
  'transport-unknown',
  'auth-unknown',
  'launch-missing',
  'launch-unexpected',
] as const satisfies readonly EndpointBodyRejection[]

export const LISTING_DEFECTS = [
  'page-failed',
  'pages-unfinished',
  'page-limit-exceeded',
  'action-limit-exceeded',
  'action-invalid',
  'duplicate-action-name',
] as const satisfies readonly ListingDefect[]

export const UNAVAILABLE_REASONS = [
  'no-longer-offered',
  'connection-unavailable',
  'authorization-required',
  'credential-unavailable',
  'landing-unavailable',
] as const satisfies readonly UnavailableReason[]

export const CONTENT_DEFECTS = [
  'not-an-object',
  'type-missing',
  'type-unknown',
  'text-invalid',
  'data-invalid',
  'mime-type-invalid',
  'uri-invalid',
  'name-invalid',
  'resource-invalid',
  'annotations-invalid',
] as const satisfies readonly ContentDefect[]

export const PROTOCOL_FAULT_KINDS = [
  'peer-error',
  'result-type-unknown',
  'result-malformed',
  'error-malformed',
] as const satisfies readonly ProtocolFault['kind'][]

export const NO_ANSWER_CAUSES = [
  'stream-broken',
  'process-exited',
  'abandoned',
] as const satisfies readonly NoAnswerCause[]

export const REFUSAL_KINDS = [
  'not-available-to-you',
  'blocked',
  'unknown',
  'config-missing',
  'config-invalid',
] as const satisfies readonly Refusal['kind'][]

export const NOT_SENT_REASON_KINDS = [
  ...REFUSAL_KINDS,
  'correlation-key-in-use',
  'cancelled',
  'definition-changed',
  'action-unavailable',
  'credential-unavailable',
  'authorization-required',
  'landing-unavailable',
  'connection-unavailable',
] as const satisfies readonly NotSentReason['kind'][]

export const KEPT_REASON_KINDS = [
  'superseded',
  'listing-incomplete',
] as const satisfies readonly KeptReason['kind'][]

export const DEGRADED_REASONS = [
  'discover-failed',
  'list-failed',
] as const satisfies readonly DegradedReason[]

export const LOST_REASONS = [
  'preparation-failed',
  'authorization-required',
  'process-exited',
  'stream-broken',
  'negotiation-invalid',
  'session-ended',
] as const satisfies readonly LostReason[]

export const ELIGIBILITY_REFUSALS = [
  'not-eligible',
  'local-command-not-enabled',
  'disabled',
] as const satisfies readonly Extract<EligibilityVerdict, { kind: 'refused' }>['reason'][]

export const CLOSED_SETS = {
  EndpointBodyRejection: ENDPOINT_BODY_REJECTIONS,
  ListingDefect: LISTING_DEFECTS,
  UnavailableReason: UNAVAILABLE_REASONS,
  ContentDefect: CONTENT_DEFECTS,
  ProtocolFault: PROTOCOL_FAULT_KINDS,
  NoAnswerCause: NO_ANSWER_CAUSES,
  Refusal: REFUSAL_KINDS,
  NotSentReason: NOT_SENT_REASON_KINDS,
  KeptReason: KEPT_REASON_KINDS,
  DegradedReason: DEGRADED_REASONS,
  LostReason: LOST_REASONS,
  EligibilityVerdict: ELIGIBILITY_REFUSALS,
} as const
