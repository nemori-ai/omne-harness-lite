import { createHash } from 'node:crypto'
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { uptime } from 'node:os'
import { join } from 'node:path'

// A tenant has a directory; a generation is one database file in it. Two small files say which
// generation is read and which one is being built.
export type Pointer = Readonly<{ generation: number; extraction: number }>
export type Building = Readonly<{ generation: number; total: number; boot: number }>

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function writeJson(file: string, value: unknown): void {
  writeFileSync(`${file}.next`, JSON.stringify(value))
  renameSync(`${file}.next`, file)
}

export const directoryOf = (root: string, tenant: string): string =>
  join(root, createHash('sha256').update(tenant).digest('hex').slice(0, 32))
export const fileOf = (directory: string, generation: number): string =>
  join(directory, `g${String(generation)}.db`)
export const currentFile = (directory: string): string => join(directory, 'current.json')
export const buildingFile = (directory: string): string => join(directory, 'building.json')
export const pointerOf = (directory: string): Pointer | null =>
  readJson<Pointer>(currentFile(directory))

/** Which start of the machine this is, in minutes since the epoch: the same until it restarts. */
export function bootOf(): number {
  const now =
    /* wall-clock: observation-time -- Names the start of the machine; compared with itself only. */ Date.now()
  return Math.round((now - uptime() * 1000) / 60_000)
}

// A generation being built is written without waiting for the disk. What a restart of the machine
// may have torn is not trusted: a build begun before the last start counts as not there.
export function buildingOf(directory: string, boot: number): Building | null {
  const found = readJson<Building>(buildingFile(directory))
  return found !== null && Math.abs(found.boot - boot) <= 1 ? found : null
}

/** Puts a file on the disk for good: after this, a loss of power does not take it back. */
export function syncFile(file: string): void {
  const descriptor = openSync(file, 'r+')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}
