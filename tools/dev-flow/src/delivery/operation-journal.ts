import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { canonical } from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import { uuid } from './input-values.ts'

/** Each intent is an exclusive, flushed file. A crash after creation requires recovery, never repost. */
export function operationJournal(root: string, operationId: string) {
  const directory = join(resolve(root), uuid(operationId, 'operationId'))
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const syncDirectory = (path: string) => {
    const fd = openSync(path, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
  for (let current = directory; ; current = dirname(current)) {
    syncDirectory(current)
    if (dirname(current) === current) break
  }
  return {
    directory,
    read(name: string): unknown | undefined {
      const path = join(directory, fileName(name))
      try {
        return strictJson(readFileSync(path, 'utf8'))
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
      }
    },
    save(name: string, value: unknown): void {
      const path = join(directory, fileName(name))
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      try {
        writeFileSync(fd, canonical(value))
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      syncDirectory(directory)
    },
  }
}

function fileName(value: string): string {
  if (!/^[a-z0-9-]+\.json$/.test(value)) throw new Error('Invalid journal entry name')
  return value
}
