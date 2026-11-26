import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs'
import { join } from 'node:path'
import {
  parsePointer,
  standingOfVersion,
  stepVersions,
  type VersionOutcome,
  type VersionPointer,
  type Versions,
} from '@omne-harness/assembly'

/** Writes a temporary file, then renames it over the path: a reader finds the old content or the new, whole. */
export function writeWhole(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

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

export type Told = Readonly<{
  outcome: VersionOutcome | 'superseded'
  pointer: VersionPointer | null
}>

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
