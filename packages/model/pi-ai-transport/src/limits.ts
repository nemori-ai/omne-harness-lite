/** The largest delay a Node timer accepts. A larger one would fire after 1 ms instead. */
export const MAX_TIMER_MS = 2_147_483_647

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/** A positive integer that a Node timer takes as given. */
export function isTimerDuration(value: unknown): value is number {
  return isPositiveInteger(value) && value <= MAX_TIMER_MS
}
