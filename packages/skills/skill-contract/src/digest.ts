// Content digests: `sha256:` plus the lowercase hexadecimal SHA-256.
import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Bytes, EntryDigest, PackageDigest, PackageEntry } from './values.ts'

const DIGEST = /^sha256:[0-9a-f]{64}$/

function isEntryDigest(text: string): text is EntryDigest {
  return DIGEST.test(text)
}

function isPackageDigest(text: string): text is PackageDigest {
  return DIGEST.test(text)
}

function sha256(update: (hash: ReturnType<typeof createHash>) => void): string {
  const hash = createHash('sha256')
  update(hash)
  return `sha256:${hash.digest('hex')}`
}

/** The digest of the exact bytes of one entry. */
export function computeDigest(bytes: Bytes): EntryDigest {
  const text = sha256(hash => hash.update(bytes))
  if (!isEntryDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}

/** Reads a package digest text, for example the `package.digest` of an asset body. */
export function toPackageDigest(text: string): Outcome<PackageDigest, 'invalid-digest'> {
  return isPackageDigest(text) ? succeed(text) : fail('invalid-digest')
}

/**
 * The package digest over entries that are already sorted by path in UTF-16 code unit order: the
 * SHA-256 of `<path>\0<entry digest>\n` for each entry, in that order.
 */
export function digestOfSorted(entries: readonly PackageEntry[]): PackageDigest {
  const text = sha256(hash => {
    for (const entry of entries) hash.update(`${entry.path}\0${entry.digest}\n`)
  })
  if (!isPackageDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}
