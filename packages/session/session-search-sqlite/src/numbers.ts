// A row of the file is numbered by its day and a serial within the day. The index stores row
// numbers whole at the head of each list, so they are kept small; the exact time is a column.
export const SERIALS = 1n << 20n
/** The layout of the file; a file written in another one is rebuilt. */
export const LAYOUT = 2
const DAY_MS = 86_400_000
const FIRST_DAY = 18_262

/** Days since the start of 2020, from 1; day 0 holds what is earlier and what has no time. */
export function dayOf(at: bigint | number): bigint {
  const day = Math.floor(Number(at) / DAY_MS) - FIRST_DAY + 1
  return day > 0 ? BigInt(day) : 0n
}

/** The document number of a row: its time, then its serial. It orders rows across days. */
export const docOf = (at: bigint, id: bigint): string => (at * SERIALS + (id % SERIALS)).toString()
