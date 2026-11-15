export class DataError extends Error {}

const PRIMARY_MASK = 0xff
const DATA_CODES = new Set([1, 18, 19, 20, 25])
const TRANSIENT_CODES = new Set([5, 6, 7, 9, 10, 13, 14])

export function resultCode(error: unknown): number | null {
  const code = (error as { errcode?: unknown } | null)?.errcode
  return typeof code === 'number' ? code & PRIMARY_MASK : null
}

export function isDataError(error: unknown): boolean {
  if (error instanceof DataError) return true
  const code = resultCode(error)
  return code !== null && DATA_CODES.has(code)
}

export function isTransientError(error: unknown): boolean {
  const code = resultCode(error)
  return code !== null && TRANSIENT_CODES.has(code)
}

const SYSTEM_CODE = /^E[A-Z0-9]+$/

export function loadFailure(error: unknown): 'transient' | 'content' {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && SYSTEM_CODE.test(code) ? 'transient' : 'content'
}

export function describeError(step: string, error: unknown): string {
  const code = resultCode(error)
  return code === null ? step : `${step}:sqlite_${String(code)}`
}
