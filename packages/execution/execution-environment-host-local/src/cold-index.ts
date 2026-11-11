// A cold index: one marker file per execution domain in the state directory, so a provider that
// starts again finds the domains an earlier one left. The platform gives the marker's shape; this
// module owns how markers are written, read, listed and removed.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/** A resource key the index accepts as a file name. */
export const indexedKey = (key: string): boolean => keyPattern.test(key)

export type ColdIndex<M> = Readonly<{
  /** Writes the marker atomically and flushes it; false when it could not be written. */
  record(key: string, marker: M): Promise<boolean>
  /** The marker; `absent` when there is none, `unreadable` when it cannot be read or parsed. */
  read(key: string): Promise<M | 'absent' | 'unreadable'>
  /** Removes the marker; false when it could not be removed. */
  forget(key: string): Promise<boolean>
  /** Every marker; `unavailable` unless every marker was read. */
  all(): Promise<readonly M[] | 'unavailable'>
}>

export function createColdIndex<M>(input: {
  directory: string
  /** The marker in `content`; undefined when any part is missing or names another key. */
  parse(content: string, key: string): M | undefined
}): ColdIndex<M> {
  const { directory } = input
  const path = (key: string) => join(directory, `${key}.json`)

  const read = async (key: string): Promise<M | 'absent' | 'unreadable'> => {
    if (!indexedKey(key)) return 'absent'
    let content: string
    try {
      content = await readFile(path(key), 'utf8')
    } catch (error) {
      return Reflect.get(Object(error), 'code') === 'ENOENT' ? 'absent' : 'unreadable'
    }
    return input.parse(content, key) ?? 'unreadable'
  }

  return Object.freeze({
    async record(key, marker) {
      if (!indexedKey(key)) return false
      const staged = join(directory, `.${key}.${process.pid}.tmp`)
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 })
        await writeFile(staged, JSON.stringify(marker), { mode: 0o600, flush: true })
        await rename(staged, path(key))
        return true
      } catch {
        await rm(staged, { force: true }).catch(() => undefined)
        return false
      }
    },
    read,
    async forget(key) {
      if (!indexedKey(key)) return true
      try {
        await rm(path(key), { force: true })
        return true
      } catch {
        return false
      }
    },
    async all() {
      let names: string[]
      try {
        names = await readdir(directory)
      } catch (error) {
        return Reflect.get(Object(error), 'code') === 'ENOENT' ? [] : 'unavailable'
      }
      const markers: M[] = []
      for (const name of names) {
        if (name.startsWith('.')) continue
        const key = name.endsWith('.json') ? name.slice(0, -'.json'.length) : ''
        if (!indexedKey(key)) return 'unavailable'
        const marker = await read(key)
        // A marker removed meanwhile was stopped; any other unread marker makes no complete list.
        if (marker === 'absent') continue
        if (marker === 'unreadable') return 'unavailable'
        markers.push(marker)
      }
      return markers
    },
  })
}
