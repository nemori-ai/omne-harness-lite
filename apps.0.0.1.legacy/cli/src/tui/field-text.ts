export const FIELD_LIMIT = 64 * 1024

/** Pure field policy, before Input/layout; no trim, replacement or silent clipping. */
export function validFieldText(value: string): boolean {
  return (
    Buffer.byteLength(value, 'utf8') <= FIELD_LIMIT &&
    value.isWellFormed() &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
}
