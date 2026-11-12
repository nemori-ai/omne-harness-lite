// Whether a failed `fetch` proves that no request byte was written. Both HTTP transports use it:
// the adapter of the three locations and the client core's. It imports no Node module; a
// browser's `fetch` carries no such code, so there every failure counts as written.

/** Connection errors that can only happen before the first request byte is written. */
const beforeFirstByte: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
])

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/**
 * True only when the failure proves that the connection never reached the write of the request:
 * the cause has a code, or a list of errors each with a code, and every code is in the set.
 */
export function neverWritten(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  const codes: (string | undefined)[] = [codeOf(cause)]
  const nested =
    typeof cause === 'object' && cause !== null && 'errors' in cause ? cause.errors : []
  if (Array.isArray(nested)) codes.push(...nested.map(codeOf))
  const known = codes.filter((code): code is string => code !== undefined)
  return known.length > 0 && known.every(code => beforeFirstByte.has(code))
}
