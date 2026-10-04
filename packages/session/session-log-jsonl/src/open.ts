import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { checkAppendInput, checkKey, checkSession, invalidInput } from '@omne-harness-lite/session-log'
import {
  fileIo,
  IoFailure,
  isIoFailure,
  trackFileIo,
  type FileIo,
  type LogFile,
} from './file-io.ts'
import { compareInteger } from '@omne-harness-lite/session-log'
import { acquireOwnerLock } from './owner-lock.ts'
import { resolveOptions, type SessionLogOptions } from './policy.ts'
import {
  commitAppend,
  initialState,
  initializeResident,
  readSnapshot,
  retireResident,
  rowsByKey,
  rowsSince,
  syncDirectory,
  type Resident,
} from './resident.ts'
import { judgeAppend } from './state.ts'
import type { AppendRequest, AppendResult, ReadResult, Unavailable } from '@omne-harness-lite/session-log'
import type { JsonlSessionLog, SessionRef } from './types.ts'

const unavailable: Unavailable = Object.freeze({ failure: 'unavailable' })
const pinnedFileOwners = new Set<Set<LogFile>>()
interface Job {
  readonly request: AppendRequest
  readonly resolve: (result: AppendResult) => void
  readonly reject: (error: unknown) => void
}
interface QueuedResident extends Resident {
  readonly queue: Job[]
  active: boolean
  lastUsed: number
  claims: number
}

export function openJsonlSessionLog(options: SessionLogOptions): Promise<JsonlSessionLog> {
  resolveOptions(options)
  return openWithIo(options, fileIo)
}

/** Internal construction seam; not exported by the package. */
export async function openWithIo(
  options: SessionLogOptions,
  suppliedIo: FileIo,
): Promise<JsonlSessionLog> {
  const { dir, policy, processOwnership, diagnostic } = resolveOptions(options)
  const files = new Set<LogFile>()
  const io = trackFileIo(suppliedIo, files)
  pinnedFileOwners.add(files)
  let identity: Awaited<ReturnType<FileIo['identity']>> | undefined
  let lock: ReturnType<typeof acquireOwnerLock> | undefined
  try {
    const firstCreated = await io.mkdir(dir)
    identity = await io.identity(dir)
    await io.open(dir, 'r')
    if (firstCreated !== undefined) {
      let current = dir
      for (;;) {
        await syncDirectory(io, current)
        if (current === dirname(firstCreated)) break
        const parent = dirname(current)
        if (parent === current) break
        current = parent
      }
    }
    lock = acquireOwnerLock(join(dir, '.owner-lock'))
    const checked = await io.identity(dir)
    if (checked.dev !== identity.dev || checked.ino !== identity.ino)
      throw new Error('session log root changed during initialization')
  } catch (error) {
    // Never release ownership before the actual directory handle has closed.
    try {
      for (const file of files) await file.close()
      lock?.release()
      pinnedFileOwners.delete(files)
    } catch (cleanupError) {
      if (isIoFailure(cleanupError)) throw new IoFailure('initialization-cleanup')
      throw cleanupError
    }
    if (isIoFailure(error)) throw new IoFailure('initialization')
    throw error
  }
  if (identity === undefined || lock === undefined)
    throw new Error('initialized log owner has missing resources')
  const rootIdentity = identity
  const ownedLock = lock
  const residents = new Map<SessionRef, QueuedResident>()
  const physicalTasks = new Set<Promise<unknown>>()
  let closing = false
  let closePromise: Promise<void> | undefined
  let used = 0
  function track<T>(operation: () => Promise<T>): Promise<T> {
    const promise = operation()
    physicalTasks.add(promise)
    promise.then(
      () => physicalTasks.delete(promise),
      () => physicalTasks.delete(promise),
    )
    return promise
  }
  async function checkRoot(): Promise<boolean> {
    try {
      const actual = await io.identity(dir)
      if (actual.dev === rootIdentity.dev && actual.ino === rootIdentity.ino) return true
    } catch (error) {
      if (!isIoFailure(error)) throw error
    }
    diagnostic(Object.freeze({ level: 'error', stage: 'root' }))
    for (const log of residents.values()) log.healthy = false
    return false
  }
  function idle(log: QueuedResident): boolean {
    return (
      !log.opening &&
      !log.retiring &&
      !log.active &&
      log.queue.length === 0 &&
      log.reads === 0 &&
      log.claims === 0
    )
  }
  async function getLog(session: SessionRef): Promise<QueuedResident | undefined> {
    if (closing) return undefined
    const existing = residents.get(session)
    if (existing !== undefined) {
      if (existing.retiring) return undefined
      existing.lastUsed = ++used
      existing.claims++
      return existing
    }
    if (residents.size >= policy.residentLogsLimit) {
      const candidate = [...residents.values()]
        .filter(idle)
        .sort((a, b) => a.lastUsed - b.lastUsed)[0]
      if (candidate === undefined) {
        diagnostic(Object.freeze({ level: 'warn', stage: 'capacity', count: residents.size }))
        return undefined
      }
      candidate.retiring = true
      try {
        await track(() => retireResident(candidate, io, diagnostic))
        residents.delete(candidate.session)
      } catch (error) {
        candidate.healthy = false
        if (!isIoFailure(error)) throw error
        diagnostic(Object.freeze({ level: 'error', stage: 'close', sessionHash: candidate.hash }))
        return undefined
      }
      if (closing) return undefined
      // Capacity can be consumed by another task while this lifecycle was awaited.
      return getLog(session)
    }
    const hash = createHash('sha256').update(session, 'utf8').digest('hex')
    const log: QueuedResident = {
      session,
      hash,
      dir: join(dir, hash),
      state: initialState(),
      rows: Object.freeze([]),
      handles: new Set<LogFile>(),
      healthy: true,
      opening: true,
      retiring: false,
      markerOwned: false,
      indexSafe: true,
      needsDirectorySync: false,
      reads: 0,
      queue: [],
      active: false,
      lastUsed: ++used,
      claims: 1,
      initialize: Promise.resolve(),
    }
    residents.set(session, log)
    log.initialize = track(async () => {
      try {
        await initializeResident(log, io, diagnostic, checkRoot, processOwnership)
      } catch (error) {
        log.healthy = false
        if (!isIoFailure(error)) throw error
        diagnostic(Object.freeze({ level: 'error', stage: 'repair', sessionHash: log.hash }))
      } finally {
        log.opening = false
      }
    })
    return log
  }
  function rejectPending(log: QueuedResident): void {
    for (const job of log.queue.splice(0)) job.resolve(unavailable)
  }
  function start(log: QueuedResident): void {
    if (log.active) return
    if (closing || !log.healthy) {
      rejectPending(log)
      return
    }
    const job = log.queue.shift()
    if (job === undefined) return
    log.active = true
    const execution = track(async () => {
      try {
        await log.initialize
        if (!log.healthy || !(await checkRoot())) {
          job.resolve(unavailable)
          return
        }
        const result = judgeAppend(log.state, job.request)
        if ('failure' in result) {
          job.resolve(result)
          return
        }
        const committed = await commitAppend(
          log,
          job.request,
          result,
          io,
          dir,
          diagnostic,
          processOwnership,
        )
        job.resolve(committed ? result : unavailable)
      } catch (error) {
        job.reject(error)
      } finally {
        log.active = false
        log.lastUsed = ++used
        start(log)
      }
    })
    // The job promise owns defects; this supervisor itself normally cannot reject.
    execution.catch(error => {
      log.healthy = false
      rejectPending(log)
      job.reject(error)
    })
  }
  async function append(
    session: SessionRef,
    entries: Parameters<JsonlSessionLog['append']>[1],
    fence: Parameters<JsonlSessionLog['append']>[2],
    condition: Parameters<JsonlSessionLog['append']>[3],
  ): Promise<AppendResult> {
    const checked = checkAppendInput(session, entries, fence, condition)
    if ('failure' in checked) return invalidInput
    if (closing) return unavailable
    return track(async () => {
      if (!(await checkRoot())) return unavailable
      const log = await getLog(checked.ok.session)
      if (log !== undefined) log.claims--
      if (
        log === undefined ||
        !log.healthy ||
        log.queue.length + Number(log.active) >= policy.appendQueueLimit
      )
        return unavailable
      return new Promise<AppendResult>((resolve, reject) => {
        log.queue.push({ request: checked.ok, resolve, reject })
        start(log)
      })
    })
  }
  async function read(
    session: SessionRef,
    select: (log: QueuedResident) => {
      readonly rows: readonly import('./derived-index.ts').IndexRow[]
      readonly match: (entry: import('@omne-harness-lite/session-log').LogEntry) => boolean
    },
  ): Promise<ReadResult> {
    if (closing) return unavailable
    return track(async () => {
      if (!(await checkRoot())) return unavailable
      const log = await getLog(session)
      if (log !== undefined) log.claims--
      if (log === undefined || !log.healthy) return unavailable
      log.reads++
      try {
        await log.initialize
        if (!log.healthy) return unavailable
        const tail = log.state.tail
        const selection = select(log)
        const entries = await readSnapshot(log, selection.rows, selection.match)
        if (!log.healthy) return unavailable
        return Object.freeze({ entries, tail })
      } catch (error) {
        if (!isIoFailure(error)) throw error
        if (error instanceof Error && 'stage' in error && error.stage === 'corrupt-read')
          log.healthy = false
        diagnostic(Object.freeze({ level: 'error', stage: 'read', sessionHash: log.hash }))
        return unavailable
      } finally {
        log.reads--
        log.lastUsed = ++used
      }
    })
  }
  return Object.freeze({
    append,
    async readByKey(session: SessionRef, key: string) {
      const checked = checkSession(session)
      if ('failure' in checked || !checkKey(key)) return invalidInput
      return read(checked.ok, log => ({
        rows: rowsByKey(log, key),
        match: entry => entry.readKeys.includes(key),
      }))
    },
    async readSince(session: SessionRef, after: import('./types.ts').JsonNumber) {
      const checked = checkSession(session)
      if ('failure' in checked || !isNonNegativeJsonInteger(after)) return invalidInput
      return read(checked.ok, log => ({
        rows: rowsSince(log, after),
        match: entry => compareInteger(entry.position, after) > 0,
      }))
    },
    close() {
      if (closePromise !== undefined) return closePromise
      closing = true
      for (const log of residents.values()) rejectPending(log)
      let closeOperation: NonNullable<import('./policy.ts').SessionLogDiagnostic['operation']> =
        'closeHandles'
      closePromise = (async () => {
        while (physicalTasks.size !== 0) await Promise.allSettled([...physicalTasks])
        // Failures remain visible; ownership stays held if any handle cannot close.
        for (const file of files) await file.close()
        closeOperation = 'markClean'
        for (const log of residents.values()) {
          if (log.healthy && log.markerOwned) await checkRoot()
          await retireResident(log, io, diagnostic)
        }
        for (const file of files) await file.close()
        closeOperation = 'releaseLock'
        ownedLock.release()
        pinnedFileOwners.delete(files)
        residents.clear()
      })().catch(error => {
        diagnostic(
          Object.freeze({
            level: 'error',
            stage: 'close',
            operation: closeOperation,
            outcome: 'failed',
          }),
        )
        if (isIoFailure(error)) throw new IoFailure('close')
        throw error
      })
      return closePromise
    },
  })
}
