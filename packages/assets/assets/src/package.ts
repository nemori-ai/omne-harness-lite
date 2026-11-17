import { createHash } from 'node:crypto'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'

export type PackageManifestEntry = {
  readonly path: string
  readonly bytes: number
  readonly digest: string
}

export type PackageManifest = { readonly entries: readonly PackageManifestEntry[] }

export type PackageSourceFailure =
  | 'package-not-found'
  | 'entry-not-found'
  | 'material-unavailable'
  | 'unavailable'

export interface PackageReader {
  manifest(): Promise<Outcome<PackageManifest, PackageSourceFailure>>
  open(path: string, expected: string): Promise<Outcome<Uint8Array, PackageSourceFailure>>
}

export type PackageRejection =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'unknown-category' }
  | { readonly kind: 'not-a-directory-category' }
  | { readonly kind: 'limit-exceeded'; readonly limit: 'files' | 'fileBytes' | 'totalBytes' }
  | { readonly kind: 'invalid-package'; readonly reason: string }
  | { readonly kind: 'source-failed'; readonly failure: PackageSourceFailure }
  | { readonly kind: 'record-rejected'; readonly reason: string }

export type PackageLayout = {
  readonly namespace: string
  readonly limits: {
    readonly files: number
    readonly fileBytes: number
    readonly totalBytes: number
  }
  readonly inspect: (pkg: PackageReader) => Promise<Outcome<JsonValue, PackageRejection>>
}

function sha256(update: (hash: ReturnType<typeof createHash>) => void): string {
  const hash = createHash('sha256')
  update(hash)
  return `sha256:${hash.digest('hex')}`
}

export function digestBytes(bytes: Uint8Array): string {
  return sha256(hash => hash.update(bytes))
}

function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
}

export function packageDigest(
  entries: readonly { readonly path: string; readonly digest: string }[],
): string {
  const sorted = [...entries].sort(byPath)
  return sha256(hash => {
    for (const entry of sorted) hash.update(`${entry.path}\0${entry.digest}\n`)
  })
}
