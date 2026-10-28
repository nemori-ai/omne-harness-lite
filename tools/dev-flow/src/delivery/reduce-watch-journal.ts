import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { object, literal, integer, same } from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import { errorCode } from './events.ts'
import { InputError } from './protocol.ts'

function requireJournalFile(path: string): void {
  try {
    const file = lstatSync(path)
    if (!file.isFile() || file.nlink !== 1)
      throw new InputError('watch-journal-regular-single-link-file-required')
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

export function loadWatchJournal(path: string): Record<string, unknown> | undefined {
  requireJournalFile(path)
  try {
    const value = object(strictJson(readFileSync(path, 'utf8')), 'watch journal')
    literal(value.schemaVersion, 1, 'watch journal.schemaVersion')
    return value
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

/** An operation holds the lock until its original shell wait settles; a crashed lock needs explicit recovery. */
export function lockWatchJournal(path: string, recover = false): () => void {
  requireJournalFile(path)
  mkdirSync(dirname(path), { recursive: true })
  const mutex = new DatabaseSync(`${path}.mutex.sqlite`)
  let fd: number | undefined
  const bytes = JSON.stringify({
    pid: process.pid,
    host: hostname(),
    owner: randomUUID(),
    startedAt: new Date().toISOString(),
  })
  try {
    // SQLite's process lock covers recovery, acquisition and release; byte comparison alone races.
    mutex.exec('BEGIN IMMEDIATE')
    if (recover) recoverLock(path)
    fd = openSync(`${path}.lock`, 'wx', 0o600)
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    mutex.close()
    if (
      errorCode(error) === 'EEXIST' ||
      (error instanceof Error && 'errcode' in error && [5, 6].includes(Number(error.errcode)))
    )
      throw new InputError('watch-already-running-or-lock-needs-recovery')
    throw error
  }
  const held = fd
  let released = false
  return () => {
    if (released) return
    released = true
    try {
      closeSync(held)
      same(readFileSync(`${path}.lock`, 'utf8'), bytes, 'watch-lock-ownership-lost')
      rmSync(`${path}.lock`)
    } finally {
      mutex.close()
    }
  }
}

export function saveWatchJournal(path: string, value: unknown): void {
  requireJournalFile(path)
  const temp = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temp, 'wx', 0o600)
  try {
    writeFileSync(fd, JSON.stringify(value))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temp, path)
  const dir = openSync(dirname(path), 'r')
  try {
    fsyncSync(dir)
  } finally {
    closeSync(dir)
  }
}

function recoverLock(path: string): void {
  let bytes: string
  try {
    bytes = readFileSync(`${path}.lock`, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw error
  }
  const lock = object(strictJson(bytes), 'watch lock')
  same(lock.host, hostname(), 'watch-lock-foreign-host')
  const pid = integer(lock.pid, 'watch lock.pid')
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (errorCode(error) !== 'ESRCH') throw new InputError('watch-lock-process-unknown')
    same(readFileSync(`${path}.lock`, 'utf8'), bytes, 'watch-lock-changed')
    rmSync(`${path}.lock`)
    return
  }
  throw new InputError('watch-lock-process-still-running')
}
