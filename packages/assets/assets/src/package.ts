// SPEC「正文是目录的类别」: the manifest of a package, the read port with two steps, and the one
// algorithm that turns a manifest into the package digest. The version of a published package is
// its package digest.
import { createHash } from 'node:crypto'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'

export type PackageManifestEntry = {
  /** A path relative to the package root, with `/` between segments. */
  readonly path: string
  readonly bytes: number
  /** The content digest of the bytes, made by `digestBytes`. */
  readonly digest: string
}

/** Every file of one package: its path, its size and its content digest. */
export type PackageManifest = { readonly entries: readonly PackageManifestEntry[] }

export type PackageSourceFailure =
  /** No package for this identity and version. */
  | 'package-not-found'
  /** The manifest has no entry with this path and digest. */
  | 'entry-not-found'
  /** The stored content does not match the manifest. No bytes are given. */
  | 'material-unavailable'
  /** The source cannot be read now. */
  | 'unavailable'

/** The read port of one package. It reads nothing outside the manifest, and no byte whose digest
 * differs from the manifest. */
export interface PackageReader {
  manifest(): Promise<Outcome<PackageManifest, PackageSourceFailure>>
  open(path: string, expected: string): Promise<Outcome<Uint8Array, PackageSourceFailure>>
}

/** Why a package is not published. Nothing is written for any of them. */
export type PackageRejection =
  /** The local member has no package root. */
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'unknown-category' }
  /** The category does not give a `layout`: its body is not a directory. */
  | { readonly kind: 'not-a-directory-category' }
  | { readonly kind: 'limit-exceeded'; readonly limit: 'files' | 'fileBytes' | 'totalBytes' }
  /** The manifest or the directory is not lawful; `reason` names the rule. */
  | { readonly kind: 'invalid-package'; readonly reason: string }
  /** The reader that the publisher gave failed. */
  | { readonly kind: 'source-failed'; readonly failure: PackageSourceFailure }
  /** The version record refused it; `reason` is the reason of the record. */
  | { readonly kind: 'record-rejected'; readonly reason: string }

/** What a category whose body is a directory gives beyond the body contract. */
export type PackageLayout = {
  /** The directory name that this category uses under the root of every layer. */
  readonly namespace: string
  readonly limits: {
    readonly files: number
    readonly fileBytes: number
    readonly totalBytes: number
  }
  /** Whether a directory is lawful, and the declaration of the category projected from it. A
   * script is a file, not a declaration. */
  readonly inspect: (pkg: PackageReader) => Promise<Outcome<JsonValue, PackageRejection>>
}

function sha256(update: (hash: ReturnType<typeof createHash>) => void): string {
  const hash = createHash('sha256')
  update(hash)
  return `sha256:${hash.digest('hex')}`
}

/** The content digest of exact bytes: `sha256:` and 64 lowercase hexadecimal digits. */
export function digestBytes(bytes: Uint8Array): string {
  return sha256(hash => hash.update(bytes))
}

/** UTF-16 code unit order. */
function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
}

/**
 * The package digest of a manifest: the SHA-256 of `<path>\0<entry digest>\n` for each entry, in
 * path order by UTF-16 code units. The size does not enter it: the entry digest fixes the bytes.
 */
export function packageDigest(
  entries: readonly { readonly path: string; readonly digest: string }[],
): string {
  const sorted = [...entries].sort(byPath)
  return sha256(hash => {
    for (const entry of sorted) hash.update(`${entry.path}\0${entry.digest}\n`)
  })
}
