/** Selected ordinary-file mechanisms from DSH JSONL; (c) 2026 DeepSeek, MIT.
 * Caller owns trusted paths, exclusive write access and mutation serialization.
 * These primitives are not the target durable-records provider or a file lock.
 */
import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

async function closePreserving(
  handle: FileHandle,
  failed: boolean,
  failure: unknown,
): Promise<void> {
  try {
    await handle.close()
  } catch (closeError) {
    if (failed)
      throw new AggregateError([failure, closeError], 'file operation and close both failed')
    throw closeError
  }
  if (failed) throw failure
}

/** Exclusive create; on failure a partial file may remain at the known path. */
export async function writeSyncedFile(path: string, content: Buffer | string): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  let failed = false
  let failure: unknown
  try {
    await handle.writeFile(content)
    await handle.sync()
  } catch (error) {
    failed = true
    failure = error
  }
  await closePreserving(handle, failed, failure)
}

/** Separate POSIX namespace durability step; unsupported Windows bridge is absent. */
export async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') throw new Error('directory sync baseline is POSIX-only')
  const handle = await open(path, 'r')
  let failed = false
  let failure: unknown
  try {
    await handle.sync()
  } catch (error) {
    failed = true
    failure = error
  }
  await closePreserving(handle, failed, failure)
}

async function rollbackAppend(path: string, size: number): Promise<void> {
  const handle = await open(path, 'r+')
  let failed = false
  let failure: unknown
  try {
    await handle.truncate(size)
    await handle.sync()
  } catch (error) {
    failed = true
    failure = error
  }
  await closePreserving(handle, failed, failure)
}

/** Append/fsync under caller's exclusive ownership; rollback failure is unknown. */
export async function appendSyncedBytes(path: string, content: Buffer | string): Promise<void> {
  const handle = await open(path, 'a')
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await handle.close()
  }
  let failed = false
  let failure: unknown
  try {
    const { size: before } = await handle.stat()
    try {
      await handle.writeFile(content)
      await handle.sync()
    } catch (error) {
      try {
        await close()
        await rollbackAppend(path, before)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `failed to roll back append to ${path}`)
      }
      throw error
    }
  } catch (error) {
    failed = true
    failure = error
  }
  try {
    await close()
  } catch (closeError) {
    if (failed) throw new AggregateError([failure, closeError], 'append and close both failed')
    throw closeError
  }
  if (failed) throw failure
}

/** Read only a complete newline-terminated first line; does not validate JSON. */
export async function readFirstLine(
  path: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted()
  const handle = await open(path, 'r')
  let failed = false
  let failure: unknown
  let result: string | undefined
  try {
    signal?.throwIfAborted()
    const chunks: Buffer[] = []
    const buf = Buffer.alloc(8192)
    for (;;) {
      signal?.throwIfAborted()
      const { bytesRead } = await handle.read(buf, 0, buf.length, null)
      signal?.throwIfAborted()
      if (bytesRead === 0) break
      const slice = buf.subarray(0, bytesRead)
      const nl = slice.indexOf(0x0a)
      if (nl !== -1) {
        chunks.push(slice.subarray(0, nl))
        signal?.throwIfAborted()
        result = Buffer.concat(chunks).toString('utf8')
        break
      }
      chunks.push(Buffer.from(slice))
    }
  } catch (error) {
    failed = true
    failure = error
  }
  await closePreserving(handle, failed, failure)
  return result
}
