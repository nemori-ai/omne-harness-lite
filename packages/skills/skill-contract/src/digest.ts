// Content digests: `sha256:` plus the lowercase hexadecimal SHA-256.
import { createHash } from 'node:crypto'
import type { Bytes, EntryDigest, PackageDigest, PackageEntry } from './values.ts'

const DIGEST = /^sha256:[0-9a-f]{64}$/

function isEntryDigest(text: string): text is EntryDigest {
  return DIGEST.test(text)
}

/** `sha256:` plus 64 lowercase hexadecimal digits, for example the `package.digest` of a body. */
export function isPackageDigest(value: unknown): value is PackageDigest {
  return typeof value === 'string' && DIGEST.test(value)
}

function sha256(update: (hash: ReturnType<typeof createHash>) => void): string {
  const hash = createHash('sha256')
  update(hash)
  return `sha256:${hash.digest('hex')}`
}

/** The digest of the exact bytes of one entry. */
export function computeDigest(bytes: Bytes): EntryDigest {
  const text = sha256(hash => hash.update(bytes))
  // Defensive only: a SHA-256 hex digest always matches the form, so the throw is never reached.
  if (!isEntryDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}

/**
 * The package digest over entries that are already sorted by path in UTF-16 code unit order: the
 * SHA-256 of `<path>\0<entry digest>\n` for each entry, in that order.
 */
export function digestOfSorted(entries: readonly PackageEntry[]): PackageDigest {
  const text = sha256(hash => {
    for (const entry of entries) hash.update(`${entry.path}\0${entry.digest}\n`)
  })
  // Defensive only, as in computeDigest.
  if (!isPackageDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}
