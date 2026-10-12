import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, link, unlink, type FileHandle } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Private IO seam. Tests inject faults around actual file operations. */
export const publicationIo = { lstat, mkdir, open, link, unlink }
export type PublicationIo = typeof publicationIo
export type PublicationResult = 'published' | 'duplicate' | 'conflict' | 'unavailable'
function code(error: unknown, value: string): boolean {
  return error instanceof Error && 'code' in error && error.code === value
}

/** Immutable local files. No filename or physical handle leaves this provider's private implementation. */
export async function createImmutableFiles(directory: string, io: PublicationIo = publicationIo) {
  const root = resolve(directory)
  await io.mkdir(root, { recursive: true, mode: 0o700 })
  const identity = await io.lstat(root, { bigint: true })
  if (!identity.isDirectory() || identity.isSymbolicLink())
    throw new Error('result root must be a directory')
  const handles = new Set<FileHandle>(),
    temporary = new Set<string>(),
    tasks = new Set<Promise<unknown>>()
  let accepting = true,
    closed = false,
    closing: Promise<void> | undefined
  const validName = (name: string) => /^[a-f0-9]{64}\.(bytes|json)$/u.test(name)
  async function sameRoot() {
    const current = await io.lstat(root, { bigint: true })
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== identity.dev ||
      current.ino !== identity.ino
    )
      throw new Error('result root changed')
  }
  async function held(path: string, flags: number) {
    const handle = await io.open(path, flags, 0o600)
    handles.add(handle)
    return handle
  }
  async function release(handle: FileHandle) {
    await handle.close()
    handles.delete(handle)
  }
  async function syncRoot() {
    await sameRoot()
    const handle = await held(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      await handle.sync()
    } finally {
      await release(handle)
    }
    await sameRoot()
  }
  async function readFile(name: string): Promise<Uint8Array | 'missing'> {
    await sameRoot()
    let handle: FileHandle
    try {
      handle = await held(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if (code(error, 'ENOENT')) return 'missing'
      throw error
    }
    try {
      if (!(await handle.stat()).isFile()) throw new Error('result file must be regular')
      const bytes = await handle.readFile()
      await sameRoot()
      return new Uint8Array(bytes)
    } finally {
      await release(handle)
    }
  }
  function track<T>(operation: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(operation)
    tasks.add(task)
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    )
    return task
  }
  async function confirm(
    name: string,
    bytes: Uint8Array,
  ): Promise<'duplicate' | 'conflict' | 'missing'> {
    const current = await readFile(name)
    if (current === 'missing') return current
    if (!Buffer.from(current).equals(bytes)) return 'conflict'
    const handle = await held(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      await handle.sync()
    } finally {
      await release(handle)
    }
    await syncRoot()
    return 'duplicate'
  }
  return Object.freeze({
    read(name: string): Promise<Uint8Array | 'missing' | 'unavailable'> {
      if (!accepting || !validName(name)) return Promise.resolve('unavailable')
      return track(async () => {
        try {
          return await readFile(name)
        } catch {
          return 'unavailable'
        }
      })
    },
    publish(name: string, supplied: Uint8Array): Promise<PublicationResult> {
      if (!accepting || !validName(name) || !(supplied instanceof Uint8Array))
        return Promise.resolve('unavailable')
      const bytes = new Uint8Array(supplied)
      return track(async (): Promise<PublicationResult> => {
        let temp: string | undefined
        try {
          const previous = await confirm(name, bytes)
          if (previous !== 'missing') return previous
          await sameRoot()
          temp = join(root, `.result-${randomUUID()}.tmp`)
          const handle = await held(
            temp,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          )
          temporary.add(temp)
          try {
            await handle.writeFile(bytes)
            await handle.sync()
          } finally {
            await release(handle)
          }
          await sameRoot()
          try {
            await io.link(temp, join(root, name))
          } catch (error) {
            if (!code(error, 'EEXIST')) throw error
            const existing = await confirm(name, bytes)
            return existing === 'missing' ? 'unavailable' : existing
          }
          await syncRoot()
          return 'published'
        } catch {
          return 'unavailable'
        } finally {
          if (temp && temporary.has(temp)) {
            try {
              await sameRoot()
              await io.unlink(temp)
              temporary.delete(temp)
            } catch (error) {
              if (code(error, 'ENOENT')) temporary.delete(temp)
            }
          }
        }
      })
    },
    close(): Promise<void> {
      accepting = false
      if (closed) return Promise.resolve()
      if (closing) return closing
      const task = (async () => {
        await Promise.allSettled([...tasks])
        const failures: unknown[] = []
        for (const handle of handles) {
          try {
            await release(handle)
          } catch (error) {
            failures.push(error)
          }
        }
        for (const temp of temporary) {
          try {
            await sameRoot()
            await io.unlink(temp)
            temporary.delete(temp)
          } catch (error) {
            if (code(error, 'ENOENT')) temporary.delete(temp)
            else failures.push(error)
          }
        }
        if (failures.length)
          throw new AggregateError(failures, 'result files retain cleanup responsibility')
        closed = true
      })()
      closing = task
      void task.catch(() => {
        closing = undefined
      })
      return task
    },
  })
}
