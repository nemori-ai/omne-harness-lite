import { ownResourceAt } from './resources.ts'
import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { SnapshotFailure, type SnapshotInspectionSession } from '@omne-harness-lite/storage'
import { MaintenanceFailure, withCleanup } from './failure.ts'
import type { PhysicalInput } from './maintenance-ports.ts'

async function readExactly(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let filled = 0
  while (filled < length) {
    const result = await handle.read(buffer, filled, length - filled, offset + filled)
    if (result.bytesRead === 0) throw new MaintenanceFailure('unavailable')
    filled += result.bytesRead
  }
  return buffer
}

export async function useInput<T>(
  path: string,
  session: SnapshotInspectionSession,
  work: (input: PhysicalInput) => Promise<T>,
): Promise<T> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  const close = ownResourceAt(
    session,
    () => handle.close(),
    () => handle.fd < 0,
    path,
  )
  return withCleanup(async () => {
    const initial = await handle.stat()
    if (!initial.isFile() || (initial.mode & 0o077) !== 0 || initial.uid !== process.getuid?.())
      throw new MaintenanceFailure('unavailable')
    return work({
      size: initial.size,
      read: (offset, length) => readExactly(handle, offset, length),
      async stable() {
        const current = await handle.stat()
        if (
          (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'] as const).some(
            field => current[field] !== initial[field],
          )
        )
          throw new SnapshotFailure('unavailable')
      },
      sync: () => handle.sync(),
    })
  }, close)
}
