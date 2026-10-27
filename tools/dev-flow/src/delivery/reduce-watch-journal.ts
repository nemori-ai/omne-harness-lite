import {
  closeSync,
  fsyncSync,
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
import { object, literal, integer, same } from '../integration/parse.ts'
import { collaborationJson } from './collaboration-json.ts'
import { errorCode } from './events.ts'
import { InputError } from './protocol.ts'

export function loadWatchJournal(path: string): Record<string, unknown> | undefined {
  try {
    const value = object(collaborationJson(readFileSync(path, 'utf8')), 'watch journal')
    literal(value.schemaVersion, 1, 'watch journal.schemaVersion')
    return value
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

/** An operation holds the lock until its original shell wait settles; a crashed lock needs explicit recovery. */
export function lockWatchJournal(path: string, recover = false): () => void {
  mkdirSync(dirname(path), { recursive: true })
  if (recover) recoverLock(path)
  let fd: number
  try {
    fd = openSync(`${path}.lock`, 'wx', 0o600)
  } catch (error) {
    if (errorCode(error) === 'EEXIST')
      throw new InputError('watch-already-running-or-lock-needs-recovery')
    throw error
  }
  writeFileSync(
    fd,
    JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
  )
  fsyncSync(fd)
  return () => {
    closeSync(fd)
    rmSync(`${path}.lock`)
  }
}

export function saveWatchJournal(path: string, value: unknown): void {
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
  const lock = object(collaborationJson(bytes), 'watch lock')
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
