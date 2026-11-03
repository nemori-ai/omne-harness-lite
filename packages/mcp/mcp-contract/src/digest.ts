// SHA-256 of UTF-8 text, written as `sha256:` and 64 lower-case hex digits. Internal.
import { createHash } from 'node:crypto'

export function sha256Text(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
}
