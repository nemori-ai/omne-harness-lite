export type Check = (value: unknown) => boolean
export const text: Check = value => typeof value === 'string' && value.length > 0
export const flag: Check = value => typeof value === 'boolean'
export const positive: Check = value => Number.isSafeInteger(value) && Number(value) > 0
export const offset: Check = value => Number.isSafeInteger(value) && Number(value) >= 0
export const bytes: Check = value => value instanceof Uint8Array
export function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}
export function shape(
  value: unknown,
  fields: Readonly<Record<string, Check>>,
  required: readonly string[],
): boolean {
  return (
    object(value) &&
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => Object.hasOwn(fields, key) && fields[key]!(value[key]))
  )
}
export const env: Check = value =>
  object(value) && Object.values(value).every(item => typeof item === 'string')
export const reference: Check = value =>
  shape(value, { id: text, generation: text }, ['id', 'generation'])
