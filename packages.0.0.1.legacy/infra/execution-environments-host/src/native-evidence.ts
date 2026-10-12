import { constants } from 'node:fs'
import { open, readFile, unlink, lstat } from 'node:fs/promises'
import type { HostProcessCoordinate } from './native-control.ts'
import { validHostCoordinate } from './native-control.ts'
import { syncHostDirectory } from './file-path.ts'

function path(coordinate: HostProcessCoordinate) {
  if (!validHostCoordinate(coordinate) || !process.getuid)
    throw new Error('Invalid native evidence coordinate')
  return `/run/user/${process.getuid()}/oh-entry-${coordinate.unit.slice(10, -6)}`
}
/** Native launch observation only; never a domain permission receipt. */
export async function recordHostGateEntry(coordinate: HostProcessCoordinate): Promise<void> {
  const handle = await open(
    path(coordinate),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await handle.writeFile(`${coordinate.boot}:${coordinate.unit}`)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await syncHostDirectory(`/run/user/${process.getuid!()}`)
}
export async function hostGateEntryConfirmed(coordinate: HostProcessCoordinate): Promise<boolean> {
  try {
    const handle = await open(
      path(coordinate),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > 256 || stat.uid !== process.getuid!()) return false
      return (await handle.readFile('utf8')) === `${coordinate.boot}:${coordinate.unit}`
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}
export async function hostCoordinateBootChanged(
  coordinate: HostProcessCoordinate,
): Promise<boolean> {
  return (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== coordinate.boot
}
async function evidenceMissing(coordinate: HostProcessCoordinate) {
  try {
    await lstat(path(coordinate))
    return false
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return true
    throw error
  }
}
export async function clearHostGateEntry(coordinate: HostProcessCoordinate): Promise<boolean> {
  try {
    if (await evidenceMissing(coordinate)) return true
    if (!(await hostGateEntryConfirmed(coordinate))) return false
    await unlink(path(coordinate))
    await syncHostDirectory(`/run/user/${process.getuid!()}`)
    return true
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
  }
}
