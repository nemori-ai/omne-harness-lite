import { Buffer } from 'node:buffer'

/** Nonempty standard alphabet, mandatory padding, and zero unused tail bits (S-11/12). */
export function isStandardBase64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![\s\S])/u.test(value) &&
    Buffer.from(value, 'base64').toString('base64') === value
  )
}
export function joinVoice(parts: readonly string[]): string {
  return Buffer.concat(parts.map(part => Buffer.from(part, 'base64'))).toString('base64')
}
