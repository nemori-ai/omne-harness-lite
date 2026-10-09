import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { StorageDefect } from '@omne-harness-lite/storage'
import type { OwnerLock } from '../upgrade/owner.ts'

/** The application owns the description. Database workers never receive it. */
const heldLocks = new Set<FileHandle>()

export class SqliteLockBusy extends Error {
  override readonly name = 'SqliteLockBusy'
}
export class SqliteLockIncomplete extends StorageDefect {
  constructor(cause?: unknown) {
    super('coordination file remains open; ownership is retained', { cause })
  }
}
export interface SqliteOwnerLock extends OwnerLock {
  readonly released: boolean
}

function acquireFileLock(handle: FileHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    // The inherited descriptor refers to the same open file description. The
    // successful helper can exit without unlocking the application's descriptor.
    const child = spawn('flock', ['--exclusive', '--nonblock', '3'], {
      stdio: ['ignore', 'ignore', 'ignore', handle.fd],
    })
    let failure: Error | undefined
    child.once('error', error => {
      failure = error
    })
    child.once('close', (code, signal) => {
      if (failure !== undefined) reject(failure)
      else if (signal !== null) reject(new Error(`coordination helper stopped with ${signal}`))
      else if (code === 0) resolve()
      else if (code === 1) reject(new SqliteLockBusy('coordination lock is occupied'))
      else reject(new Error(`coordination helper failed (${code})`))
    })
  })
}

/** Linux provider exclusion; the permanent lock file must never be replaced. */
export async function acquireSqliteLock(file: string): Promise<SqliteOwnerLock> {
  const handle = await open(
    file,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  )
  heldLocks.add(handle)
  const close = async () => {
    let failure: unknown
    try {
      await handle.close()
    } catch (error) {
      failure = error
    }
    if (handle.fd >= 0) throw new SqliteLockIncomplete(failure)
    heldLocks.delete(handle)
    if (failure !== undefined) throw failure
  }
  try {
    await acquireFileLock(handle)
  } catch (error) {
    try {
      await close()
    } catch (cleanup) {
      const combined = new AggregateError(
        [error, cleanup],
        'coordination acquisition and cleanup failed',
      )
      if (handle.fd >= 0) throw new SqliteLockIncomplete(combined)
      throw combined
    }
    throw error
  }
  return {
    get released() {
      return handle.fd < 0
    },
    async release() {
      if (handle.fd >= 0) await close()
    },
  }
}
