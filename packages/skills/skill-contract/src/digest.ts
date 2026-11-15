import { createHash } from 'node:crypto'
import type { Bytes, EntryDigest, PackageDigest, PackageEntry } from './values.ts'

const DIGEST = /^sha256:[0-9a-f]{64}$/

function isEntryDigest(text: string): text is EntryDigest {
  return DIGEST.test(text)
}

export function isPackageDigest(value: unknown): value is PackageDigest {
  return typeof value === 'string' && DIGEST.test(value)
}

function sha256(update: (hash: ReturnType<typeof createHash>) => void): string {
  const hash = createHash('sha256')
  update(hash)
  return `sha256:${hash.digest('hex')}`
}

export function computeDigest(bytes: Bytes): EntryDigest {
  const text = sha256(hash => hash.update(bytes))
  if (!isEntryDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}

export function digestOfSorted(entries: readonly PackageEntry[]): PackageDigest {
  const text = sha256(hash => {
    for (const entry of entries) hash.update(`${entry.path}\0${entry.digest}\n`)
  })
  if (!isPackageDigest(text)) throw new Error('SHA-256 did not give a digest text')
  return text
}
