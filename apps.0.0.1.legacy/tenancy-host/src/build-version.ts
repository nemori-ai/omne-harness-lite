import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { HOST_VERSION } from './version.ts'

export async function readBuildId(
  marker = new URL('../BUILD_ID', import.meta.url),
): Promise<string | null> {
  let file
  try {
    file = await open(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('invalid-build-id')
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size < 64 || stat.size > 65) throw new Error('invalid-build-id')
    const buffer = Buffer.alloc(66)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    const value = buffer.subarray(0, bytesRead).toString('latin1')
    if (!/^[0-9a-f]{64}\n?$/.test(value)) throw new Error('invalid-build-id')
    return value.trimEnd()
  } finally {
    await file.close()
  }
}
export async function buildVersionText(marker?: URL): Promise<string> {
  return `tenancy-host ${HOST_VERSION} ${(await readBuildId(marker)) ?? 'development'}\n`
}
interface VersionIo {
  stdout(text: string): Promise<void>
  stderr(text: string): Promise<void>
}
export async function printBuildVersion(io: VersionIo, marker?: URL): Promise<number> {
  try {
    await io.stdout(await buildVersionText(marker))
    return 0
  } catch {
    try {
      await io.stderr('tenancy-host: version unavailable\n')
    } catch {
      // A broken diagnostic stream cannot turn the original failure into success.
    }
    return 1
  }
}
