import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import { isMediaKey, type ByteStore, type PortFailure } from '@omne-harness/media-contract'

export type LocalByteStoreOptions = Readonly<{ root: string; name?: string }>

const PREFIX = 'local:'
const codeOf = (error: unknown): string => String((error as NodeJS.ErrnoException).code)
const missing = (error: unknown): boolean => codeOf(error) === 'ENOENT'
const unavailable = (error: unknown) =>
  fail<PortFailure>({ kind: 'unavailable', diagnostic: codeOf(error) })
const unknown = (error: unknown) =>
  fail<PortFailure>({ kind: 'unknown', diagnostic: codeOf(error) })

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (missing(error)) return false
    throw error
  }
}

async function writeDurably(
  path: string,
  write: (file: Awaited<ReturnType<typeof open>>) => Promise<void>,
) {
  const draft = `${path}.${randomUUID()}.draft`
  const file = await open(draft, 'wx')
  try {
    await write(file)
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(draft, path)
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

/** The byte store on a local directory: segments are files, a seal is a synced rename. */
export function createLocalByteStore(options: LocalByteStoreOptions): ByteStore {
  const home = (key: string): string => join(options.root, 'objects', key.slice(0, 2))
  const sealedAt = (key: string): string => join(home(key), key)
  const writingAt = (key: string): string => join(options.root, 'writing', key)
  const keyOf = (write: string): string | null => {
    const key = write.slice(PREFIX.length)
    return write.startsWith(PREFIX) && isMediaKey(key) ? key : null
  }

  /** Joins the segments into the object, durably. False: a segment is missing. */
  async function joinParts(key: string, parts: number): Promise<boolean> {
    const have = new Set(await readdir(writingAt(key)))
    for (let sequence = 0; sequence < parts; sequence += 1)
      if (!have.has(String(sequence))) return false
    await mkdir(home(key), { recursive: true })
    await writeDurably(sealedAt(key), async file => {
      for (let sequence = 0; sequence < parts; sequence += 1) {
        const part = await open(join(writingAt(key), String(sequence)), 'r')
        try {
          const { size } = await part.stat()
          const buffer = Buffer.alloc(size)
          await part.read(buffer, 0, size, 0)
          await file.write(buffer)
        } finally {
          await part.close()
        }
      }
    })
    await syncDirectory(home(key))
    return true
  }

  return {
    name: options.name ?? 'local',
    async begin(key) {
      if (!isMediaKey(key)) return fail({ kind: 'invalid-key' })
      try {
        await mkdir(writingAt(key), { recursive: true })
        return succeed({ write: `${PREFIX}${key}` })
      } catch (error) {
        return unavailable(error)
      }
    },
    async append(write, sequence, part) {
      const key = keyOf(write)
      if (key === null) return fail({ kind: 'no-write' })
      try {
        await writeDurably(join(writingAt(key), String(sequence)), async file => {
          await file.write(part)
        })
        return succeed(null)
      } catch (error) {
        return missing(error) ? fail({ kind: 'no-write' }) : unavailable(error)
      }
    },
    async seal(write, parts) {
      const key = keyOf(write)
      if (key === null) return fail({ kind: 'no-write' })
      try {
        if (!(await exists(sealedAt(key)))) {
          if (!(await exists(writingAt(key)))) return fail({ kind: 'no-write' })
          if (!(await joinParts(key, parts))) return fail({ kind: 'gap' })
        }
        await rm(writingAt(key), { recursive: true, force: true })
        return succeed({ bytes: (await stat(sealedAt(key))).size })
      } catch (error) {
        return unknown(error)
      }
    },
    async open(key, range) {
      if (!isMediaKey(key)) return fail({ kind: 'not-found' })
      try {
        const { size } = await stat(sealedAt(key))
        const start = range?.offset ?? 0
        const end = Math.min(size, start + (range?.length ?? size)) - 1
        if (start > end) return succeed((async function* (): AsyncIterable<Uint8Array> {})())
        return succeed(createReadStream(sealedAt(key), { start, end }) as AsyncIterable<Uint8Array>)
      } catch (error) {
        return missing(error) ? fail({ kind: 'not-found' }) : unavailable(error)
      }
    },
    async remove(key) {
      if (!isMediaKey(key)) return succeed(null)
      try {
        await rm(sealedAt(key), { force: true })
        await rm(writingAt(key), { recursive: true, force: true })
        return succeed(null)
      } catch (error) {
        return unknown(error)
      }
    },
    async abort(write) {
      const key = keyOf(write)
      if (key === null) return succeed(null)
      try {
        await rm(writingAt(key), { recursive: true, force: true })
        return succeed(null)
      } catch (error) {
        return unknown(error)
      }
    },
  }
}
