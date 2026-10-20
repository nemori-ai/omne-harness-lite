export type RefusalReason =
  | 'malformed'
  | 'duplicate-capability'
  | 'unknown-attribute'
  | 'unknown-position'
  | 'unknown-power'
  | 'dimension-missing'
  | 'dimension-not-allowed'
  | 'power-above-ceiling'
  | 'needs-not-allowed'
  | 'implementation-missing'
  | 'error-policy-not-allowed'
  | 'unavailability-not-allowed'
  | 'executable'
  | 'checker-failed'

/**
 * The reasons for which a judgment of an extension output refuses it (extensions.md, "Conclusion").
 * They are separate from `RefusalReason`: a refused output is an error of a running extension, not
 * of a declaration.
 */
export type OutputRefusalReason =
  | 'malformed'
  | 'position_unknown'
  | 'power_unknown'
  | 'dimension_missing'
  | 'dimension_not_allowed'
  | 'output_not_allowed_for_power'
  | 'output_not_allowed_at_position'
  | 'ask_at_forbidden_position'
  | 'rewrite_touches_immutable'
  | 'inject_source_mismatch'

export type Judgment<T, Reason extends string = RefusalReason> =
  | { readonly kind: 'accepted'; readonly value: T }
  | { readonly kind: 'refused'; readonly reason: Reason }

export type BatchJudgment<T> =
  | { readonly kind: 'accepted'; readonly value: readonly T[] }
  | { readonly kind: 'refused'; readonly reason: RefusalReason; readonly index: number }

export function refused<T>(reason: RefusalReason): Judgment<T> {
  return { kind: 'refused', reason }
}
