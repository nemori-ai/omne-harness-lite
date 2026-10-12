import { rm, lstat, mkdir, writeFile } from 'node:fs/promises'
import type { HostProcessCoordinate } from './native-control.ts'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { validHostCoordinate } from './native-control.ts'

export function hostResourceDirectory(coordinate: HostProcessCoordinate): string {
  if (!validHostCoordinate(coordinate) || !process.getuid)
    throw new Error('Invalid resource coordinate')
  return `/run/user/${process.getuid()}/ot-${coordinate.unit.slice(10, -6)}`
}
export async function createHostResourceDirectory(coordinate: HostProcessCoordinate) {
  const directory = hostResourceDirectory(coordinate)
  await mkdir(directory, { mode: 0o700 })
  await writeFile(directory + '/identity', `${coordinate.boot}:${coordinate.unit}`, {
    flag: 'wx',
    mode: 0o600,
  })
  return directory
}
function absent(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
async function directoryAbsent(coordinate: HostProcessCoordinate) {
  try {
    await lstat(hostResourceDirectory(coordinate))
    return false
  } catch (error) {
    return absent(error)
  }
}
async function originalMarker(path: string, coordinate: HostProcessCoordinate) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.uid !== process.getuid!() || stat.size > 1024) return false
    return (await handle.readFile('utf8')) === `${coordinate.boot}:${coordinate.unit}`
  } finally {
    await handle.close()
  }
}
export async function clearHostResourceDirectory(
  coordinate: HostProcessCoordinate,
): Promise<boolean> {
  try {
    const directory = hostResourceDirectory(coordinate)
    if (!(await originalMarker(`${directory}/identity`, coordinate))) return false
    await rm(directory, { recursive: true, force: false })
    return true
  } catch (error) {
    return absent(error) ? directoryAbsent(coordinate) : false
  }
}
