/** A refused input: a bad option, file or JSON value. The message names the path, never the value. */
export class InputError extends Error {
  override name = 'DeliveryInputError'
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new InputError(`${path} must be an object`)
  return value
}
export function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new InputError(`${path} must be a string`)
  return value
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new InputError(`${path} must be an array`)
  return value
}
