import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

/** BUILD_ID is a build artifact, never a login/state lookup. */
export async function versionText(
  marker = new URL('../BUILD_ID', import.meta.url),
): Promise<string> {
  let file
  try {
    file = await open(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'omne 0.0.0 development\n'
    throw new Error('invalid-build-id')
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size < 64 || stat.size > 65) throw new Error('invalid-build-id')
    const data = Buffer.alloc(66)
    const { bytesRead } = await file.read(data, 0, data.length, 0)
    const value = data.subarray(0, bytesRead).toString('latin1')
    if (!/^[0-9a-f]{64}\n?$/.test(value)) throw new Error('invalid-build-id')
    return `omne 0.0.0 ${value.trimEnd()}\n`
  } finally {
    await file.close()
  }
}
