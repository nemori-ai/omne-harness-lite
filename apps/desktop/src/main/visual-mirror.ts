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
 whatever the disk says. */
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
  const listeners = new Set<() => void>()
  function load(): VisualRecord | undefined {
    try {
      return records.decode(withFileRetry(() => fs.readFileSync(file), fs)).record
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return undefined
      throw err
    }
  }
  let record: VisualRecord | undefined
  let unread = false
  try {
    record = load()
  } catch (err) {
    unread = true
    log.warn({ err }, 'visual mirror read failed')
  }
  let raw = record ? records.encode(record) : null
  let pending = false
  function replace(next: VisualRecord) {
    const previousTheme = records.effective(record).theme
    raw = records.encode(next)
    record = next
    if (records.effective(next).theme === previousTheme) return
    for (const notify of listeners) {
      try {
        notify()
      } catch (err) {
        log.warn({ err }, 'applying native visual appearance failed')
      }
    }
  }
  // A file that could not be read is read again before anything is written over it; a newer record there wins.
  function settleUnread(): boolean {
    if (!unread) return true
    let stored: VisualRecord | undefined
    try {
      stored = load()
    } catch (err) {
      log.warn({ err }, 'visual mirror read failed')
      return false
    }
    unread = false
    if (stored && records.behind(record, stored)) {
      replace(stored)
      pending = false
    }
    return true
  }
  function persist(value: string) {
    try {
      writeDurably(fs, temp, value)
      renameWithRetry(fs, temp, file)
      pending = false
    } catch (err) {
      pending = true
      try {
        fs.rmSync(temp, { force: true })
      } catch {
        // A subsequent attempt replaces the temporary file.
      }
      log.warn({ err }, 'visual mirror write failed')
    }
  }
  function retryPending() {
    if (pending && raw !== null && settleUnread() && pending) persist(raw)
  }
  return {
    read: (): VisualMirrorSnapshot => ({ record: raw, pending }),
    theme: () => records.effective(record).theme,
    retryPending,
    push(input: unknown): 'ok' | 'failed' {
      const next = typeof input === 'string' ? records.decode(input).record : undefined
      if (!next) {
        retryPending()
        log.warn({}, 'invalid visual mirror record')
        return 'failed'
      }
      const readable = settleUnread()
      const order = record ? records.compare(next, record) : 1
      if (order <= 0) {
        retryPending()
        return pending && order === 0 ? 'failed' : 'ok'
      }
      if (readable) persist(records.encode(next))
      else pending = true
      replace(next)
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
