import { randomBytes } from 'node:crypto'
import { mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { digestBytes, type PackageReader } from '@omne-harness/assets'
import type { Placed } from '@omne-harness/assets-tools'
import { nodeFileIo } from '../plugin-access/file-io.ts'

const hidden = (name: string): boolean => name.startsWith('.')
const safe = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')

/** A directory on disk as a package: its files, none whose name begins with a dot, each opened only as it was listed. */
function directoryPackage(root: string): PackageReader {
  return {
    async manifest() {
      try {
        const found = await readdir(root, { recursive: true, withFileTypes: true })
        const files = found
          .filter(entry => entry.isFile())
          .map(entry =>
            join(entry.parentPath, entry.name)
              .slice(root.length + 1)
              .split(sep),
          )
          .filter(segments => !segments.some(hidden))
        const entries = await Promise.all(
          files.map(async segments => {
            const file = join(root, ...segments)
            const [{ size }, { digest }] = await Promise.all([
              stat(file),
              nodeFileIo.digest(file, false),
            ])
            return { path: segments.join('/'), bytes: size, digest: `sha256:${digest}` }
          }),
        )
        return { ok: { entries: entries.sort((left, right) => (left.path < right.path ? -1 : 1)) } }
      } catch {
        return { failure: 'unavailable' }
      }
    },
    async open(path, expected) {
      if (!safe(path)) return { failure: 'entry-not-found' }
      try {
        const file = join(root, ...path.split('/'))
        const { size } = await stat(file)
        const bytes = await nodeFileIo.range(file, 0, size)
        return digestBytes(bytes) === expected ? { ok: bytes } : { failure: 'material-unavailable' }
      } catch {
        return { failure: 'entry-not-found' }
      }
    },
  }
}

export async function directoryIn(
  working: string,
  path: string,
): Promise<PackageReader | 'absent' | 'unavailable'> {
  if (!safe(path)) return 'absent'
  try {
    const inside = await realpath(working)
    const root = await realpath(join(inside, ...path.split('/'))).catch(() => undefined)
    if (root === undefined || !root.startsWith(inside + sep)) return 'absent'
    return (await stat(root)).isDirectory() ? directoryPackage(root) : 'absent'
  } catch {
    return 'unavailable'
  }
}

const within = (inside: string, path: string): boolean =>
  path === inside || path.startsWith(inside + sep)

/** The real path of the deepest part of a path that is there: a link on the way is followed before anything is made under it. */
async function deepestReal(path: string): Promise<string> {
  for (let at = path; ; at = dirname(at)) {
    const real = await realpath(at).catch(() => undefined)
    if (real !== undefined) return real
  }
}

type Listed = readonly Readonly<{ path: string; bytes: number; digest: string }>[]

function differing(wanted: Listed, there: Listed): readonly string[] {
  const now = new Map(there.map(entry => [entry.path, entry.digest]))
  const asked = new Set(wanted.map(entry => entry.path))
  const changed = wanted.filter(entry => now.get(entry.path) !== entry.digest)
  const extra = there.filter(entry => !asked.has(entry.path))
  return [...changed, ...extra].map(entry => entry.path).sort()
}

/** Every file is written beside the target first, so a file that cannot be read leaves nothing behind. */
async function writeAll(target: string, exists: boolean, from: PackageReader, files: Listed) {
  const staged = `${target}.export-${randomBytes(4).toString('hex')}`
  try {
    for (const { path, digest } of files) {
      const opened = await from.open(path, digest)
      if (!('ok' in opened)) throw new Error(opened.failure)
      const file = join(staged, ...path.split('/'))
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, opened.ok)
    }
    if (!exists) return await rename(staged, target)
    for (const name of await readdir(staged)) await rename(join(staged, name), join(target, name))
  } finally {
    await rm(staged, { recursive: true, force: true })
  }
}

/** Writes a package into a directory of the working directory that is missing or holds no file; else tells whether what is there is the same. */
export async function placeIn(working: string, path: string, from: PackageReader): Promise<Placed> {
  if (!safe(path)) return { kind: 'absent' }
  const inside = await realpath(working)
  const target = join(inside, ...path.split('/'))
  if (!within(inside, await deepestReal(target))) return { kind: 'absent' }
  const found = await stat(target).catch(() => undefined)
  if (found !== undefined && !found.isDirectory()) return { kind: 'absent' }
  const parent = await stat(await deepestReal(dirname(target)))
  if (!parent.isDirectory()) return { kind: 'absent' }
  const wanted = await from.manifest()
  if (!('ok' in wanted) || !wanted.ok.entries.every(entry => safe(entry.path)))
    return { kind: 'unavailable' }
  const files = wanted.ok.entries
  const there = found === undefined ? undefined : await directoryPackage(target).manifest()
  if (there !== undefined && !('ok' in there)) return { kind: 'unavailable' }
  if (there !== undefined && there.ok.entries.length > 0) {
    const paths = differing(files, there.ok.entries)
    if (paths.length === 0) return { kind: 'same' }
    return { kind: 'differs', paths: paths.slice(0, 10), more: Math.max(0, paths.length - 10) }
  }
  // The first parent made here is taken away again when nothing could be written under it.
  const made = await mkdir(dirname(target), { recursive: true })
  try {
    await writeAll(target, found !== undefined, from, files)
  } catch (error) {
    if (made !== undefined) await rm(made, { recursive: true, force: true })
    throw error
  }
  return { kind: 'written', files: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0) }
}
