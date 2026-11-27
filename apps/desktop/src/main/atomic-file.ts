import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'

/** The file operations a store persists with, and its wait between rename attempts; replaceable in tests. */
export interface AtomicFileFs {
  openSync(path: string, flags: 'w'): number
  writeFileSync(fd: number, data: string): void
  fsyncSync(fd: number): void
  closeSync(fd: number): void
  renameSync(from: string, to: string): void
  rmSync(path: string, options: { force: true }): void
  sleep(ms: number): void
}

export const nodeFs: AtomicFileFs = {
  openSync: (path, flags) => openSync(path, flags),
  writeFileSync: (fd, data) => writeFileSync(fd, data),
  fsyncSync,
  closeSync,
  renameSync,
  rmSync,
  // A synchronous wait between attempts, at most about 100 ms in all.
  sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
}

// Windows antivirus and indexing can briefly block reads and renames.
const FILE_RETRY_MS = [10, 20, 30, 40]
const RETRYABLE_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES'])

function retryDelay(error: unknown, attempt: number): number {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  const wait = FILE_RETRY_MS[attempt]
  if (wait === undefined || typeof code !== 'string' || !RETRYABLE_ERRORS.has(code)) throw error
  return wait
}

export function withFileRetry<T>(operation: () => T, fs: Pick<AtomicFileFs, 'sleep'> = nodeFs): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return operation()
    } catch (err) {
      fs.sleep(retryDelay(err, attempt))
    }
  }
}

export function renameWithRetry(fs: AtomicFileFs, from: string, to: string): void {
  withFileRetry(() => fs.renameSync(from, to), fs)
}

/** Writes `data` to `path` and flushes it to the disk, so a rename over the old file never exposes an empty one. */
export function writeDurably(fs: AtomicFileFs, path: string, data: string): void {
  const fd = fs.openSync(path, 'w')
  try {
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}
