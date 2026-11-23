import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { BodyContract } from './identity.ts'
import { packageBody } from './package-body.ts'
import {
  packageDigest,
  type PackageLayout,
  type PackageManifest,
  type PackageReader,
  type PackageRejection,
} from './package.ts'

function isSafePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

type Declared = Readonly<{ entries: readonly Readonly<{ path: string; bytes: number }>[] }>

function pathRejection(manifest: Declared): PackageRejection | undefined {
  const paths = new Set<string>()
  for (const entry of manifest.entries) {
    if (!isSafePath(entry.path) || paths.has(entry.path))
      return { kind: 'invalid-package', reason: 'manifest-path' }
    paths.add(entry.path)
  }
  for (const path of paths) {
    const segments = path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1)
      if (paths.has(segments.slice(0, depth).join('/')))
        return { kind: 'invalid-package', reason: 'manifest-path' }
  }
  return undefined
}

function limitRejection(
  manifest: Declared,
  limits: PackageLayout['limits'],
): PackageRejection | undefined {
  if (manifest.entries.length > limits.files) return { kind: 'limit-exceeded', limit: 'files' }
  if (manifest.entries.some(entry => entry.bytes > limits.fileBytes))
    return { kind: 'limit-exceeded', limit: 'fileBytes' }
  const total = manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0)
  if (total > limits.totalBytes) return { kind: 'limit-exceeded', limit: 'totalBytes' }
  return undefined
}

/** The path rules and the category limits a package is held to, judged on its file list alone. */
export function declarationRejection(
  declared: Declared,
  limits: PackageLayout['limits'],
): PackageRejection | undefined {
  return pathRejection(declared) ?? limitRejection(declared, limits)
}

/** A package that is one directory of another: its files by their paths inside that directory, and no other file. */
export function withinDirectory(pkg: PackageReader, directory: string): PackageReader {
  const prefix = `${directory}/`
  return {
    async manifest() {
      const listed = await pkg.manifest()
      if (!('ok' in listed)) return listed
      const entries = listed.ok.entries
        .filter(entry => entry.path.startsWith(prefix))
        .map(entry => ({ ...entry, path: entry.path.slice(prefix.length) }))
      return succeed({ entries })
    },
    async open(path, expected) {
      return isSafePath(path) ? pkg.open(`${prefix}${path}`, expected) : fail('entry-not-found')
    },
  }
}

export type JudgedPackage = Readonly<{
  manifest: PackageManifest
  version: string
  body: JsonValue
}>

/** Judges a directory as the content of one capability of a category: its file list, what its layout reads, and its body. */
export async function judgePackageContent(
  contract: BodyContract,
  from: PackageReader,
  capabilityName: string,
): Promise<Outcome<JudgedPackage, PackageRejection>> {
  const layout = contract.layout
  if (layout === undefined) return fail({ kind: 'not-a-directory-category' })
  const listed = await from.manifest()
  if (!('ok' in listed)) return fail({ kind: 'source-failed', failure: listed.failure })
  const manifest = listed.ok
  const invalid = declarationRejection(manifest, layout.limits)
  if (invalid !== undefined) return fail(invalid)
  const inspected = await layout.inspect(from)
  if (!('ok' in inspected)) return inspected
  const body = packageBody(inspected.ok, manifest)
  if (!('ok' in body)) return body
  const version = packageDigest(manifest.entries)
  const judged = contract.judge(body.ok, { capabilityName, definition: version })
  if (!judged.ok) return fail({ kind: 'invalid-package', reason: judged.rejected })
  return succeed({ manifest, version, body: body.ok })
}
