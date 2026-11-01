// Classification of SQLite errors (SPEC 7.6). Node reports the SQLite result code in `errcode`.

/** Thrown by the provider for a value that cannot be bound. It is a data error, like SQLITE_RANGE. */
export class DataError extends Error {}

const PRIMARY_MASK = 0xff
/** TOOBIG 18, CONSTRAINT 19, MISMATCH 20, RANGE 25 and ERROR 1 (syntax or schema). */
const DATA_CODES = new Set([1, 18, 19, 20, 25])
/** BUSY 5, LOCKED 6, NOMEM 7, INTERRUPT 9, IOERR 10, FULL 13, CANTOPEN 14. */
const TRANSIENT_CODES = new Set([5, 6, 7, 9, 10, 13, 14])

export function resultCode(error: unknown): number | null {
  const code = (error as { errcode?: unknown } | null)?.errcode
  return typeof code === 'number' ? code & PRIMARY_MASK : null
}

/** An error that only the statement and the data decide. The result is an explicit rollback. */
export function isDataError(error: unknown): boolean {
  if (error instanceof DataError) return true
  const code = resultCode(error)
  return code !== null && DATA_CODES.has(code)
}

/** An environment error that may go away. DO-1 returns to `unopened` for it. */
export function isTransientError(error: unknown): boolean {
  const code = resultCode(error)
  return code !== null && TRANSIENT_CODES.has(code)
}

/** A diagnostic without SQL text: the name of the failing step and the result code. */
export function describeError(step: string, error: unknown): string {
  const code = resultCode(error)
  return code === null ? step : `${step}:sqlite_${String(code)}`
}
