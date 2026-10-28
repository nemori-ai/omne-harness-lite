import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { canonical, digest } from '../integration/parse.ts'
import type { WaveIdentity } from './collaboration-records.ts'
import { InputError } from './protocol.ts'

/** A leftover lock requires explicit recovery by the owner. Age and PID never transfer authority. */
export function withReduceLock<T>(
  root: string,
  context: WaveIdentity,
  operationId: string,
  action: () => T,
): T {
  const directory = resolve(root)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(
    directory,
    `reduce-${digest(canonical([context.repo, context.milestone]))}.lock`,
  )
  let fd: number
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new InputError('reduce-local-writer-conflict')
    throw error
  }
  try {
    writeFileSync(fd, canonical({ context, operationId, pid: process.pid }))
    fsyncSync(fd)
    return action()
  } finally {
    closeSync(fd)
    unlinkSync(path)
  }
}
