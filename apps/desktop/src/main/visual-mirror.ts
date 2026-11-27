import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { VisualMirrorSnapshot } from '../shared/desktop-bridge.ts'
import { visualRecordKernel as records, type VisualRecord } from '../shared/visual-record.ts'

import {
  nodeFs,
  renameWithRetry,
  withFileRetry,
  writeDurably,
  type AtomicFileFs,
} from './atomic-file.ts'
import type { Logger } from './log.ts'

const fileSystem = { ...nodeFs, readFileSync: (file: string) => readFileSync(file, 'utf8') }
export type VisualMirror = ReturnType<typeof createVisualMirror>

/** The main process's copy of the visual record: on disk before it answers `ok`, applied to the native look
 whatever the disk says. A file it could not read is never written over until it is read. */
export function createVisualMirror(
  userData: string,
  {
    log,
    fs = fileSystem,
  }: {
    log: Pick<Logger, 'warn'>
    fs?: AtomicFileFs & { readFileSync(file: string): string }
  },
) {
  const file = join(userData, 'visual.json')
  const temp = file + '.tmp'
  let record: VisualRecord | undefined
  let raw: string | null = null
  let unread = true
  let pending = false
  const listeners = new Set<() => void>()

  function adopt(next: VisualRecord | undefined, encoded = next ? records.encode(next) : null) {
    const previousTheme = records.effective(record).theme
    record = next
    raw = encoded
    if (records.effective(next).theme === previousTheme) return
    for (const notify of listeners) {
      try {
        notify()
      } catch {
        log.warn({}, 'applying native visual appearance failed')
      }
    }
  }
  function readDiskIfUnread() {
    if (!unread) return
    let stored: string
    try {
      stored = withFileRetry(() => fs.readFileSync(file), fs)
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') unread = false
      else log.warn({ err }, 'visual mirror read failed')
      return
    }
    unread = false
    adopt(records.decode(stored).record)
  }
  readDiskIfUnread()
  function persist(value: string) {
    try {
      writeDurably(fs, temp, value)
      renameWithRetry(fs, temp, file)
      pending = false
    } catch {
      pending = true
      try {
        fs.rmSync(temp, { force: true })
      } catch {
        // A subsequent attempt replaces the temporary file.
      }
      log.warn({}, 'visual mirror write failed')
    }
  }
  function retryPending() {
    readDiskIfUnread()
    if (pending && raw !== null) persist(raw)
  }
  return {
    read(): VisualMirrorSnapshot {
      readDiskIfUnread()
      return { record: raw, pending: unread || pending }
    },
    theme: () => records.effective(record).theme,
    retryPending,
    push(input: unknown): 'ok' | 'failed' {
      const next = typeof input === 'string' ? records.decode(input).record : undefined
      if (!next) {
        retryPending()
        log.warn({}, 'invalid visual mirror record')
        return 'failed'
      }
      readDiskIfUnread()
      if (unread) return 'failed'
      const order = record ? records.compare(next, record) : 1
      if (order <= 0) {
        retryPending()
        return pending && order === 0 ? 'failed' : 'ok'
      }
      const encoded = records.encode(next)
      persist(encoded)
      adopt(next, encoded)
      return pending ? 'failed' : 'ok'
    },
    onThemeChange(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
