import { statSync } from 'node:fs'
import { backup, type DatabaseSync } from 'node:sqlite'
import type { SqliteCommand } from './worker-protocol.ts'

type BackupCommand = Extract<SqliteCommand, { kind: 'backup' }>

function refuse(code: string): never {
  throw Object.assign(new Error(code), { code })
}

function check(command: BackupCommand, control: Int32Array, totalPages = 0): void {
  if (Atomics.load(control, 0) !== 0) refuse('OMNE_SNAPSHOT_CANCELLED')
  const limits = command.limits
  if (limits === undefined) return
  if (totalPages * limits.pageSize > limits.maxBytes) refuse('OMNE_SNAPSHOT_CAPACITY')
  try {
    if (statSync(limits.walFile).size >= limits.maxBytes) refuse('OMNE_SNAPSHOT_CAPACITY')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

/** Native backup owns the fixed read until its promise settles. */
export async function backupConnection(
  db: DatabaseSync,
  command: BackupCommand,
  progress: () => void,
): Promise<void> {
  const control = new Int32Array(command.control)
  check(command, control)
  await backup(db, command.file, {
    rate: 128,
    progress({ totalPages }) {
      check(command, control, totalPages)
      if (command.progress) {
        Atomics.store(control, 1, 0)
        progress()
        // Only the package-private test hook uses this handshake. Production
        // backup checks shared cancellation without waiting for the application.
        while (Atomics.load(control, 1) === 0) Atomics.wait(control, 1, 0)
      }
      check(command, control, totalPages)
    },
  })
}
