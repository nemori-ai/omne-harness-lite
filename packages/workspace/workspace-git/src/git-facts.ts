import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { reason, type TypeAnswer } from '@omne-harness/workspace-contract'

/** The directory every working copy of one repository shares, and what tells it from another there later. */
export type Repository = Readonly<{ commonDirectory: string; identity: string }>

/** `head` is the commit checked out, or `unborn:<branch>` before the first commit. */
export type WorkingCopy = Readonly<{ repository: Repository; head: string }>

const SMALL = 4096
const PACKED = 8 * 1024 * 1024
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
const REF = /^refs(?:\/[A-Za-z0-9._-]+)+$/u
const MISSING = new Set(['ENOENT', 'ENOTDIR'])
const NOT_ONE = { refused: reason('not-a-working-copy') } as const

class Unreadable extends Error {}

const codeOf = (error: unknown): string => String((error as NodeJS.ErrnoException).code)

async function kindOf(path: string): Promise<'directory' | 'file' | 'other' | null> {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'
  } catch (error) {
    if (MISSING.has(codeOf(error))) return null
    throw error
  }
}

/** A regular file, read whole and never through a link. Null: it is not there. */
async function text(path: string, limit = SMALL): Promise<string | null> {
  let file
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (MISSING.has(codeOf(error))) return null
    throw new Unreadable(`${codeOf(error)}: ${path}`)
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > limit) throw new Unreadable(`not a small file: ${path}`)
    return await file.readFile('utf8')
  } finally {
    await file.close()
  }
}

/** A file under a directory of the repository, reached through no link that leads out of it. */
async function within(base: string, name: string, limit?: number): Promise<string | null> {
  const path = join(base, name)
  let parent: string
  try {
    parent = await realpath(dirname(path))
  } catch (error) {
    if (MISSING.has(codeOf(error))) return null
    throw error
  }
  if (parent !== base && !parent.startsWith(base + sep))
    throw new Unreadable(`outside the repository: ${path}`)
  return text(path, limit)
}

function packed(refs: string | null, name: string): string | null {
  for (const line of refs?.split('\n') ?? []) {
    const [commit, ref] = line.split(' ')
    if (ref === name && COMMIT.test(commit ?? '')) return commit!
  }
  return null
}

async function headOf(gitDirectory: string, common: string): Promise<string | null> {
  let value = (await text(join(gitDirectory, 'HEAD')))?.trim() ?? null
  if (value === null) return null
  for (let hops = 0; hops < 5; hops += 1) {
    if (COMMIT.test(value)) return value
    const name: string = value.startsWith('ref: ') ? value.slice(5).trim() : ''
    if (!REF.test(name) || name.includes('..')) throw new Unreadable('HEAD names no ref')
    const loose = (await within(gitDirectory, name)) ?? (await within(common, name))
    const next = loose?.trim() ?? packed(await within(common, 'packed-refs', PACKED), name)
    if (next === null) return `unborn:${name}`
    value = next
  }
  throw new Unreadable('HEAD follows too many refs')
}

async function gitDirectoryOf(root: string): Promise<string | null> {
  const entry = join(root, '.git')
  const kind = await kindOf(entry)
  if (kind === 'directory') return entry
  if (kind !== 'file') return null
  const pointer = /^gitdir: (.+)$/u.exec((await text(entry))?.trim() ?? '')?.[1]
  if (pointer === undefined) throw new Unreadable('.git is a file that names no directory')
  const linked = resolve(root, pointer)
  // A linked working copy is one the repository lists: it points back at this `.git` file.
  const back = (await text(join(linked, 'gitdir')))?.trim()
  if (back === undefined || (await kindOf(resolve(linked, back))) === null) return null
  return (await realpath(resolve(linked, back))) === entry ? linked : null
}

/** Reads files only. Nothing here starts a program, and nothing is written. */
export async function readWorkingCopy(root: string): Promise<TypeAnswer<WorkingCopy>> {
  try {
    const gitDirectory = await gitDirectoryOf(root)
    if (gitDirectory === null) return NOT_ONE
    const shared = (await text(join(gitDirectory, 'commondir')))?.trim()
    const common = await realpath(
      shared === undefined ? gitDirectory : resolve(gitDirectory, shared),
    )
    if ((await kindOf(join(common, 'objects'))) !== 'directory') return NOT_ONE
    if ((await kindOf(join(common, 'reftable'))) !== null)
      return { refused: reason('unsupported-ref-format'), final: true }
    const head = await headOf(await realpath(gitDirectory), common)
    if (head === null) return NOT_ONE
    const stat = await lstat(common, { bigint: true })
    return {
      ok: { repository: { commonDirectory: common, identity: `${stat.dev}:${stat.ino}` }, head },
    }
  } catch (error) {
    return { unavailable: error instanceof Unreadable ? error.message : codeOf(error) }
  }
}
