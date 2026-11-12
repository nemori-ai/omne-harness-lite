// Content digests: `sha256:` plus the lowercase hexadecimal SHA-256. The algorithms belong to
// assets (SPEC「正文是目录的类别」); this module only grants the Skill brands.
import { digestBytes, packageDigest } from '@omne-harness/assets'
import type { Bytes, EntryDigest, PackageDigest } from './values.ts'

const DIGEST = /^sha256:[0-9a-f]{64}$/

function isEntryDigest(text: string): text is EntryDigest {
  return DIGEST.test(text)
}

/** `sha256:` plus 64 lowercase hexadecimal digits, for example the `package.digest` of a body. */
export function isPackageDigest(value: unknown): value is PackageDigest {
  return typeof value === 'string' && DIGEST.test(value)
}

/** The digest of the exact bytes of one entry. */
export function computeDigest(bytes: Bytes): EntryDigest {
  const text = digestBytes(bytes)
  // Defensive only: a SHA-256 hex digest always matches the form, so the throw is never reached.
  if (!isEntryDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}

/** The package digest over entries, by the one algorithm of assets: `packageDigest`. */
export function digestOfEntries(
  entries: readonly Readonly<{ path: string; digest: string }>[],
): PackageDigest {
  const text = packageDigest(entries)
  // Defensive only, as in computeDigest.
  if (!isPackageDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}
