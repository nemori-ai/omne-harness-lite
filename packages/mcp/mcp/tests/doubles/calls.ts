// Test helper: which calls of a port a double changes, by their number (the first call is 1). A
// double counts its calls and asks `which` about each one, so "the second call stalls" and "from
// the third call on, no answer" are written the same way.

/** Picks calls by their number; the first call is 1. */
export type Which = (call: number) => boolean

/** The `n`-th call only. */
export const only =
  (n: number): Which =>
  call =>
    call === n

/** Every call from the `n`-th on. */
export const from =
  (n: number): Which =>
  call =>
    call >= n

/** The calls from the `first`-th to the `last`-th, both included. */
export const between =
  (first: number, last: number): Which =>
  call =>
    call >= first && call <= last

export type Picker = Readonly<{
  /** How many calls were counted. */
  calls: () => number
  /** Counts one call; true when `which` picks it. */
  next: () => boolean
}>

export function picker(which: Which): Picker {
  let count = 0
  return {
    calls: () => count,
    next: () => {
      count += 1
      return which(count)
    },
  }
}
