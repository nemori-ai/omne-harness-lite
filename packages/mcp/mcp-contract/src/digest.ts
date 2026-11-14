import { createHash } from 'node:crypto'

export function digestOf<T extends string>(text: string, guard: (value: unknown) => value is T): T {
  const digest = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
  if (!guard(digest)) throw new TypeError('SHA-256 did not give 64 hex digits')
  return digest
}
