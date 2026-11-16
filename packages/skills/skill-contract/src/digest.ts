import { digestBytes, packageDigest } from '@omne-harness/assets'
import type { Bytes, EntryDigest, PackageDigest } from './values.ts'

const DIGEST = /^sha256:[0-9a-f]{64}$/

function isEntryDigest(text: string): text is EntryDigest {
  return DIGEST.test(text)
}

export function isPackageDigest(value: unknown): value is PackageDigest {
  return typeof value === 'string' && DIGEST.test(value)
}

export function computeDigest(bytes: Bytes): EntryDigest {
  const text = digestBytes(bytes)
  if (!isEntryDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}

export function digestOfEntries(
  entries: readonly Readonly<{ path: string; digest: string }>[],
): PackageDigest {
  const text = packageDigest(entries)
  if (!isPackageDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}
