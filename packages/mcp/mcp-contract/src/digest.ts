// SHA-256 of UTF-8 text, written as `sha256:` and 64 lower-case hex digits. Internal.
import { createHash } from 'node:crypto'

/** The digest of `text`, granted its brand by `guard`. A digest the guard refuses is a defect. */
export function digestOf<T extends string>(text: string, guard: (value: unknown) => value is T): T {
  const digest = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
  if (!guard(digest)) throw new TypeError('SHA-256 did not give 64 hex digits')
  return digest
}
