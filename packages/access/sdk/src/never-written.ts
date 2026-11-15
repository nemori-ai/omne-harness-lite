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

const refusedByFetch = 'bad port'

export function neverWritten(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  if (cause instanceof Error && cause.message === refusedByFetch) return true
  const codes: (string | undefined)[] = [codeOf(cause)]
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'errors' in cause &&
    Array.isArray(cause.errors)
  )
    codes.push(...cause.errors.map(codeOf))
  const known = codes.filter((code): code is string => code !== undefined)
  return known.length > 0 && known.every(code => beforeFirstByte.has(code))
}
