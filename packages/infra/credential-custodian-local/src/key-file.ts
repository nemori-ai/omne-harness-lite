import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'

/** Reads and validates one actual file handle; never creates a key or caches it across operations. */
export async function readKeyFile(keyFile: string): Promise<Buffer> {
  let handle
  let key: Buffer | undefined
  let result: Buffer | undefined
  try {
    // Nonblocking open also lets us reject a FIFO by fstat without waiting for a writer.
    handle = await open(keyFile, constants.O_RDONLY | constants.O_NONBLOCK)
    const before = await handle.stat()
    if (!before.isFile() || (before.mode & 0o777) !== 0o600 || before.size !== 32)
      throw new StorageUnavailable('model replica key unavailable')
    key = Buffer.alloc(33)
    const { bytesRead } = await handle.read(key, 0, 33, 0)
    const after = await handle.stat()
    if (bytesRead !== 32 || !after.isFile() || (after.mode & 0o777) !== 0o600 || after.size !== 32)
      throw new StorageUnavailable('model replica key unavailable')
    result = Buffer.from(key.subarray(0, 32))
  } catch {
    throw new StorageUnavailable('model replica key unavailable')
  } finally {
    key?.fill(0)
    if (handle !== undefined) {
      try {
        await handle.close()
      } catch {
        result?.fill(0)
        throw new StorageDefect('model replica key release failed')
      }
    }
  }
  if (result === undefined) throw new StorageDefect('model replica key read incomplete')
  return result
}
