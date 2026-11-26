import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  type Dirent,
} from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import {
  parsePointer,
  standingOfVersion,
  stepVersions,
  type VersionOutcome,
  type VersionPointer,
  type Versions,
} from '@omne-harness/assembly'
import { writeWhole } from '../write-whole.ts'

export const VERSIONS_DIR = 'versions'
export const POINTER_FILE = 'current.json'
const PARTIAL = '.partial'
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

function listed(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return []
    throw error
  }
}

function pointerOf(root: string): VersionPointer | null {
  let text: string
  try {
    text = readFileSync(join(root, POINTER_FILE), 'utf8')
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return null
    throw error
  }
  const pointer = parsePointer(text)
  if (pointer === undefined) throw new Error(`${join(root, POINTER_FILE)} is not a pointer`)
  return pointer
}

/** What the install root holds now: a directory under its last name is a whole version, one under the temporary name is not. */
export function readVersions(root: string): Versions {
  const installed: Record<string, 'partial' | 'complete'> = {}
  for (const entry of listed(join(root, VERSIONS_DIR))) {
    if (!entry.isDirectory()) continue
    if (!entry.name.endsWith(PARTIAL)) installed[entry.name] = 'complete'
    else installed[entry.name.slice(0, -PARTIAL.length)] ??= 'partial'
  }
  return { installed, pointer: pointerOf(root) }
}

function digestOf(directory: string): string {
  const hash = createHash('sha256')
  const walk = (under: string): void => {
    const entries = readdirSync(join(directory, under), { withFileTypes: true })
    for (const entry of entries.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = under === '' ? entry.name : `${under}/${entry.name}`
      if (entry.isSymbolicLink()) hash.update(`l ${path} ${readlinkSync(join(directory, path))}\n`)
      else if (entry.isDirectory()) walk(path)
      else {
        const content = createHash('sha256').update(readFileSync(join(directory, path)))
        hash.update(`f ${path} ${content.digest('hex')}\n`)
      }
    }
  }
  walk('')
  return hash.digest('hex')
}

function manifestOf(directory: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

/** Copies a built server under the install root: into a temporary name first, renamed when it is whole. */
export function installVersion(
  root: string,
  from: string,
  label?: string,
): { version: string; outcome: VersionOutcome } {
  const named = label ?? manifestOf(from)['version']
  if (typeof named !== 'string' || !LABEL.test(named) || named.endsWith(PARTIAL))
    throw new Error(`a version is named by letters, digits, and . _ + - ; got ${String(named)}`)
  const version = `${named}-${digestOf(from).slice(0, 12)}`
  const before = readVersions(root)
  const standing = standingOfVersion(before, version)
  if (standing !== 'absent' && standing !== 'partial')
    return { version, outcome: stepVersions(before, { kind: 'begin', version }).outcome }
  const partial = join(root, VERSIONS_DIR, version + PARTIAL)
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(join(root, VERSIONS_DIR), { recursive: true })
  cpSync(from, partial, { recursive: true, verbatimSymlinks: true })
  renameSync(partial, join(root, VERSIONS_DIR, version))
  return { version, outcome: 'moved' }
}

/** The file a version is started by: the `bin` of its own package. */
export function entryOfVersion(root: string, version: string): string {
  const directory = join(root, VERSIONS_DIR, version)
  const bin = manifestOf(directory)['bin']
  const entry = typeof bin === 'string' ? bin : (bin as Record<string, unknown>)?.['harness-server']
  if (typeof entry !== 'string') throw new Error(`version ${version} names no harness-server bin`)
  return resolve(directory, entry)
}

/** Why the build started by `entry` is not the one to run under the install root, or null when the pointer names it. */
export function refusedByPointer(root: string, entry: string): string | null {
  let named: string | undefined
  let own: string | undefined
  try {
    named = readVersions(root).pointer?.current
    const under = relative(join(realpathSync(root), VERSIONS_DIR), realpathSync(entry)).split(sep)
    own = under.length > 1 && under[0] !== '..' ? under[0] : undefined
  } catch (error) {
    return `version-pointer-unreadable: ${error instanceof Error ? error.message : String(error)}`
  }
  if (named !== undefined && named === own) return null
  return `version-not-current: the pointer under ${root} names ${named ?? 'no version'}; this build is ${own ?? 'not a version under it'}`
}

type Told = Readonly<{ outcome: VersionOutcome | 'superseded'; pointer: VersionPointer | null }>

function moved(root: string, before: Versions, step: ReturnType<typeof stepVersions>): Told {
  const { pointer } = step.versions
  if (pointer !== null && pointer !== before.pointer)
    writeWhole(join(root, POINTER_FILE), `${JSON.stringify(pointer)}\n`)
  return { outcome: step.outcome, pointer }
}

/** Points at a version that is wholly installed; the next start is of it. */
export function switchVersion(root: string, version: string): Told {
  const before = readVersions(root)
  return moved(root, before, stepVersions(before, { kind: 'switch', version }))
}

/** What came of the version that was started. When the pointer names another one by now, it is not about that one. */
export function tellVersions(
  root: string,
  started: string,
  kind: 'settled' | 'fell-to-limit',
): Told {
  const before = readVersions(root)
  if (before.pointer?.current !== started) return { outcome: 'superseded', pointer: before.pointer }
  return moved(root, before, stepVersions(before, { kind }))
}
