import { constants, type Stats } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  SourceFileRead,
  SourceFiles,
  SourceFilesRead,
  SourceLimits,
} from '@omne-harness/workspace-contract'

const MISSING = new Set(['ENOENT', 'ENOTDIR'])
const LINK = new Set(['ELOOP', 'EMLINK'])
// No link is followed, and a pipe never makes a read wait.
const FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK

const codeOf = (error: unknown): string => String((error as NodeJS.ErrnoException).code)

class Refused extends Error {
  readonly kind: 'over-limit' | 'linked' | 'irregular' | 'missing'
  constructor(kind: Refused['kind']) {
    super(kind)
    this.kind = kind
  }
}

/** The thing at the end of the segments, none of which may be a link. The root is the instance's own. */
async function reach(root: string, path: readonly string[]): Promise<Stats> {
  let at = root
  let stat = await lstat(root)
  for (const segment of path) {
    at = join(at, segment)
    stat = await lstat(at)
    if (stat.isSymbolicLink()) throw new Refused('linked')
  }
  return stat
}

async function contentOf(path: string, size: number): Promise<Uint8Array> {
  const file = await open(path, FLAGS)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Refused('irregular')
    // It changed between the listing and the read: the reading that compares passes sees it.
    if (stat.size !== size) throw new Refused('missing')
    return new Uint8Array(await file.readFile())
  } finally {
    await file.close()
  }
}

type Listed = { path: string; full: string; bytes: number }

async function list(directory: string, inside: string, limits: SourceLimits, into: Listed[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    const path = inside === '' ? entry.name : `${inside}/${entry.name}`
    if (entry.isSymbolicLink()) throw new Refused('linked')
    if (entry.isDirectory()) await list(full, path, limits, into)
    else if (!entry.isFile()) throw new Refused('irregular')
    else {
      const { size } = await lstat(full)
      into.push({ path, full, bytes: size })
      const total = into.reduce((sum, item) => sum + item.bytes, 0)
      if (into.length > limits.files || size > limits.fileBytes || total > limits.totalBytes)
        throw new Refused('over-limit')
    }
  }
}

function refusal(error: unknown): Readonly<{ kind: Refused['kind'] | 'unreadable' }> {
  if (error instanceof Refused) return { kind: error.kind }
  const code = codeOf(error)
  if (MISSING.has(code)) return { kind: 'missing' }
  return { kind: LINK.has(code) ? 'linked' : 'unreadable' }
}

/** Reads source roots as files: never writes, never follows a link, stays within the bounds. */
export const localSourceFiles: SourceFiles = {
  async directories(root, path) {
    try {
      if (!(await reach(root, path)).isDirectory()) return null
      const entries = await readdir(join(root, ...path), { withFileTypes: true })
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch (error) {
      const answer = refusal(error)
      if (answer.kind === 'unreadable') throw error
      return null
    }
  },

  async files(root, path, limits): Promise<SourceFilesRead> {
    try {
      if (!(await reach(root, path)).isDirectory()) return { kind: 'missing' }
      const listed: Listed[] = []
      await list(join(root, ...path), '', limits, listed)
      const files = []
      for (const item of listed)
        files.push({ path: item.path, bytes: await contentOf(item.full, item.bytes) })
      return { kind: 'read', files }
    } catch (error) {
      return refusal(error)
    }
  },

  async file(root, path, limit): Promise<SourceFileRead> {
    try {
      const stat = await reach(root, path)
      if (!stat.isFile()) return { kind: 'irregular' }
      if (stat.size > limit) return { kind: 'over-limit' }
      return { kind: 'bytes', bytes: await contentOf(join(root, ...path), stat.size) }
    } catch (error) {
      return refusal(error)
    }
  },
}
