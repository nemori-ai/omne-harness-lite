// Reads an asar archive's header and files, without @electron/asar: the release check reads the
// package exactly as shipped.
import { createHash } from 'node:crypto'

export type AsarEntry = Readonly<{
  path: string
  kind: 'file' | 'link' | 'directory'
  size: number
  offset: number
  unpacked: boolean
  integrity?: string
}>

export type Asar = Readonly<{ headerJson: string; dataOffset: number; entries: AsarEntry[] }>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function entryOf(path: string, child: Record<string, unknown>): AsarEntry {
  const unpacked = child['unpacked'] === true
  if (typeof child['link'] === 'string') return { path, kind: 'link', size: 0, offset: 0, unpacked }
  const size = Number(child['size'])
  const offset = child['offset'] === undefined ? 0 : Number(child['offset'])
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(offset))
    throw new Error(`asar header: ${path} has no valid size or offset`)
  const integrity = isObject(child['integrity']) ? child['integrity']['hash'] : undefined
  return {
    path,
    kind: 'file',
    size,
    offset,
    unpacked,
    ...(typeof integrity === 'string' ? { integrity } : {}),
  }
}

export function readAsar(archive: Buffer): Asar {
  if (archive.length < 16) throw new Error('not an asar archive: too short')
  if (archive.readUInt32LE(0) !== 4) throw new Error('not an asar archive: bad size pickle')
  const headerSize = archive.readUInt32LE(4)
  const jsonLength = archive.readUInt32LE(12)
  if (8 + headerSize > archive.length || 16 + jsonLength > 8 + headerSize)
    throw new Error('not an asar archive: header out of bounds')
  const headerJson = archive.subarray(16, 16 + jsonLength).toString('utf8')
  const entries: AsarEntry[] = []
  const walk = (node: unknown, prefix: string): void => {
    if (!isObject(node) || !isObject(node['files']))
      throw new Error(`asar header: ${prefix || '/'} is not a directory`)
    for (const [name, child] of Object.entries(node['files'])) {
      const path = prefix ? `${prefix}/${name}` : name
      if (!isObject(child)) throw new Error(`asar header: ${path} is not an entry`)
      if (!isObject(child['files'])) {
        entries.push(entryOf(path, child))
        continue
      }
      entries.push({
        path,
        kind: 'directory',
        size: 0,
        offset: 0,
        unpacked: child['unpacked'] === true,
      })
      walk(child, path)
    }
  }
  walk(JSON.parse(headerJson), '')
  return { headerJson, dataOffset: 8 + headerSize, entries }
}

export function asarFile(archive: Buffer, asar: Asar, path: string): Buffer {
  const entry = asar.entries.find(candidate => candidate.path === path)
  if (entry === undefined || entry.kind !== 'file')
    throw new Error(`${path} is not a file in the archive`)
  if (entry.unpacked) throw new Error(`${path} is unpacked, outside the archive`)
  const start = asar.dataOffset + entry.offset
  if (start + entry.size > archive.length)
    throw new Error(`${path} runs past the end of the archive`)
  return archive.subarray(start, start + entry.size)
}

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex')

/** What Info.plist's ElectronAsarIntegrity records for the archive: the hash of its header. */
export const asarHeaderHash = (asar: Asar): string => sha256(asar.headerJson)
