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
const HOPS = 5
const POINTER = 'gitdir: '
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
// No part of the name starts with a dot, so none of them leads upward.
const SYMBOLIC = /^ref:\s*(refs(?:\/(?!\.)[^/\s\\~^:?*[]+)+)$/u
const PACKED_LINE = /^([0-9a-f]{40}|[0-9a-f]{64}) (\S+)$/gmu
const MISSING = new Set(['ENOENT', 'ENOTDIR'])
const NOT_ONE = { refused: reason('not-a-working-copy') } as const

class Unreadable extends Error {}

const codeOf = (error: unknown): string => String((error as NodeJS.ErrnoException).code)

/** Null when nothing is there. Any other failure is thrown: it could not be looked at. */
async function present<T>(look: Promise<T>): Promise<T | null> {
  try {
    return await look
  } catch (error) {
    if (MISSING.has(codeOf(error))) return null
    throw error
  }
}

async function text(path: string, limit = SMALL): Promise<string | null> {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  const file = await present(open(path, flags))
  if (file === null) return null
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > limit) throw new Unreadable(`not a small file: ${path}`)
    return (await file.readFile('utf8')).trim()
  } finally {
    await file.close()
  }
}

async function within(base: string, name: string, limit?: number): Promise<string | null> {
  const path = join(base, name)
  const parent = await present(realpath(dirname(path)))
  if (parent === null) return null
  if (parent !== base && !parent.startsWith(base + sep))
    throw new Unreadable(`outside the repository: ${path}`)
  return text(path, limit)
}

async function refOf(gitDirectory: string, common: string, name: string): Promise<string | null> {
  const loose = (await within(gitDirectory, name)) ?? (await within(common, name))
  if (loose !== null) return loose
  const refs = await within(common, 'packed-refs', PACKED)
  if (refs === null) return null
  for (const [, commit, ref] of refs.matchAll(PACKED_LINE)) if (ref === name) return commit!
  return null
}

async function headOf(gitDirectory: string, common: string): Promise<string | null> {
  let value = await text(join(gitDirectory, 'HEAD'))
  if (value === null) return null
  for (let hops = 0; hops < HOPS; hops += 1) {
    if (COMMIT.test(value)) return value
    const name = SYMBOLIC.exec(value)?.[1]
    if (name === undefined) throw new Unreadable('HEAD names no ref')
    const next = await refOf(gitDirectory, common, name)
    if (next === null) return `unborn:${name}`
    value = next
  }
  throw new Unreadable('HEAD follows too many refs')
}

async function gitDirectoryOf(root: string): Promise<string | null> {
  const entry = join(root, '.git')
  const stat = await present(lstat(entry))
  if (stat?.isDirectory() === true) return entry
  if (stat?.isFile() !== true) return null
  const pointer = (await text(entry)) ?? ''
  if (!pointer.startsWith(POINTER)) throw new Unreadable('.git is a file that names no directory')
  const linked = resolve(root, pointer.slice(POINTER.length))
  // A linked working copy is one the repository lists: it points back at this `.git` file.
  const back = await text(join(linked, 'gitdir'))
  if (back === null) return null
  return (await present(realpath(resolve(linked, back)))) === entry ? linked : null
}

/** Reads files only. Nothing here starts a program, and nothing is written. */
export async function readWorkingCopy(root: string): Promise<TypeAnswer<WorkingCopy>> {
  try {
    const gitDirectory = await gitDirectoryOf(root)
    if (gitDirectory === null) return NOT_ONE
    const shared = await text(join(gitDirectory, 'commondir'))
    const common = await realpath(resolve(gitDirectory, shared ?? '.'))
    if ((await present(lstat(join(common, 'objects'))))?.isDirectory() !== true) return NOT_ONE
    if ((await present(lstat(join(common, 'reftable')))) !== null)
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
