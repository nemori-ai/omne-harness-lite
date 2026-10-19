export type RefusalReason =
  | 'malformed'
  | 'duplicate-capability'
  | 'unknown-attribute'
  | 'unknown-position'
  | 'unknown-power'
  | 'dimension-missing'
  | 'dimension-not-allowed'
  | 'power-above-ceiling'
  | 'executable'
  | 'checker-failed'

export type Judgment<T> =
  | { readonly kind: 'accepted'; readonly value: T }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }

export type BatchJudgment<T> =
  | { readonly kind: 'accepted'; readonly value: readonly T[] }
  | { readonly kind: 'refused'; readonly reason: RefusalReason; readonly index: number }

export function refused<T>(reason: RefusalReason): Judgment<T> {
  return { kind: 'refused', reason }
}
