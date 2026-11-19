import { createHash } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// A tenant has a directory; a generation is one database file in it. Two small files say which
// generation is read and which one is being built.
export type Pointer = Readonly<{ generation: number; extraction: number }>
export type Building = Readonly<{ generation: number; total: number }>

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
export const buildingOf = (directory: string): Building | null =>
  readJson<Building>(buildingFile(directory))
