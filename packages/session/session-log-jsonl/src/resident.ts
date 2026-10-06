import { join } from 'node:path'
import { decodeLogBytes, encodeCommitLine } from './codec.ts'
import {
  decodeIndexBytes,
  encodeIndexRows,
  foldIndexRows,
  indexRow,
  type IndexRow,
} from './derived-index.ts'
import {
  IoFailure,
  isIoFailure,
  isMissing,
  syncDirectory,
  trackFileIo,
  type FileIo,
  type LogFile,
} from './file-io.ts'
import { addInteger, compareInteger } from '@omne-harness-lite/session-log'
import type { ProcessOwnership, SessionLogDiagnostic } from './policy.ts'
import { enterRecovery, replaceRecovery } from './recovery.ts'
import { emptyLogState, foldCommit } from './state.ts'
import type { AppendRequest, AppendSuccess, LogEntry } from '@omne-harness-lite/session-log'
import type { LogState, SessionRef } from './types.ts'

export interface Resident {
  readonly session: SessionRef
  readonly hash: string
  readonly dir: string
  state: LogState
  rows: readonly IndexRow[]
  file?: LogFile
  readonly handles: Set<LogFile>
  healthy: boolean
  opening: boolean
  retiring: boolean
  markerOwned: boolean
  indexSafe: boolean
  needsDirectorySync: boolean
  reads: number
  initialize: Promise<void>
}
export type Diagnose = (event: SessionLogDiagnostic) => void
export { syncDirectory } from './file-io.ts'
function report(log: Resident, diagnostic: Diagnose, stage: SessionLogDiagnostic['stage']): void {
  diagnostic(
    Object.freeze({ level: stage === 'index' ? 'warn' : 'error', stage, sessionHash: log.hash }),
  )
}
async function rewriteIndex(log: Resident, io: FileIo, diagnostic: Diagnose): Promise<boolean> {
  log.indexSafe = false
  try {
    const temporary = join(log.dir, 'index.tmp')
    const file = await io.open(temporary, 'w')
    try {
      const bytes = encodeIndexRows(log.rows)
      if ((await file.write(bytes)) !== bytes.length) throw new IoFailure('index-write')
      await file.datasync()
    } finally {
      await file.close()
    }
    await io.rename(temporary, join(log.dir, 'index.jsonl'))
    await syncDirectory(io, log.dir)
    log.indexSafe = true
    return true
  } catch (error) {
    if (!isIoFailure(error)) throw error
    report(log, diagnostic, 'index')
    return false
  }
}
/** No business file is changed before the durable recovery gate. */
export async function initializeResident(
  log: Resident,
  io: FileIo,
  diagnostic: Diagnose,
  checkRoot: () => Promise<boolean>,
  ownership: ProcessOwnership,
): Promise<void> {
  io = trackFileIo(io, log.handles)
  try {
    try {
      await io.identity(log.dir)
    } catch (error) {
      if (isMissing(error) && (await checkRoot())) return
      throw error
    }
    const mode = await enterRecovery(io, log.dir, log.hash, ownership, diagnostic)
    if (mode === undefined) {
      log.healthy = false
      return
    }
    log.markerOwned = true
    try {
      log.file = await io.open(join(log.dir, 'entries.jsonl'), 'a-existing')
    } catch (error) {
      if (!isMissing(error)) throw error
      const names = await io.readdir(log.dir)
      if (names.some(name => !['recovery.json', 'recovery.json.next'].includes(name)))
        throw new IoFailure('missing-entries')
      return
    }
    const size = await log.file.size()
    let rows: readonly IndexRow[] | undefined
    if (mode === 'clean') {
      try {
        rows = decodeIndexBytes(await io.readFile(join(log.dir, 'index.jsonl')))
      } catch (error) {
        if (!isIoFailure(error)) throw error
        report(log, diagnostic, 'index')
      }
    }
    const last = rows?.[rows.length - 1]
    if (last !== undefined) {
      if (last.end > size) rows = undefined
      else {
        const checked = decodeLogBytes(
          await log.file.read(last.start, last.end - last.start),
          log.session,
          last.first,
        )
        if (
          'failure' in checked ||
          checked.needsTruncation ||
          checked.commits.length !== 1 ||
          checked.commits[0]?.commit.entries.length !== last.count ||
          checked.validBytes !== last.end - last.start
        )
          rows = undefined
      }
    }
    const indexWasValid = rows !== undefined
    log.indexSafe = indexWasValid
    rows ??= []
    let state = foldIndexRows(rows)
    const start = rows[rows.length - 1]?.end ?? 0
    const decoded = decodeLogBytes(
      await log.file.read(start, size - start),
      log.session,
      addInteger(state.tail, 1),
      state.tenant,
    )
    if ('failure' in decoded) {
      log.healthy = false
      report(log, diagnostic, 'corrupt')
      return
    }
    const nextRows: IndexRow[] = [...rows]
    diagnostic(
      Object.freeze({
        level: 'warn',
        stage: 'recovery',
        sessionHash: log.hash,
        operation: start === 0 ? 'fullScan' : 'suffixScan',
        count: decoded.commits.length,
        outcome: 'completed',
      }),
    )
    for (const location of decoded.commits) {
      nextRows.push(
        indexRow(
          location.commit,
          start + location.start,
          start + location.end,
          nextRows.length === 0,
        ),
      )
      state = foldCommit(state, location.commit)
    }
    if (decoded.needsTruncation) {
      await log.file.truncate(start + decoded.validBytes)
      await log.file.datasync()
      diagnostic(
        Object.freeze({
          level: 'warn',
          stage: 'repair',
          sessionHash: log.hash,
          operation: 'tailRepair',
          count: size - start - decoded.validBytes,
          outcome: 'completed',
        }),
      )
    }
    log.state = state
    log.rows = Object.freeze(nextRows)
    if (!indexWasValid || decoded.commits.length !== 0 || decoded.needsTruncation)
      await rewriteIndex(log, io, diagnostic)
  } catch (error) {
    if (!isIoFailure(error)) throw error
    log.healthy = false
    report(log, diagnostic, 'repair')
  } finally {
    log.opening = false
  }
}
async function appendIndex(
  log: Resident,
  row: IndexRow,
  io: FileIo,
  diagnostic: Diagnose,
): Promise<void> {
  log.indexSafe = false
  try {
    const file = await io.open(join(log.dir, 'index.jsonl'), 'a+')
    try {
      const bytes = encodeIndexRows([row])
      if ((await file.write(bytes)) !== bytes.length) throw new IoFailure('index-write')
    } finally {
      await file.close()
    }
  } catch (error) {
    if (!isIoFailure(error)) throw error
    report(log, diagnostic, 'index')
  }
}
/** Caller retains queue ownership through this operation and all repair IO. */
export async function commitAppend(
  log: Resident,
  request: AppendRequest,
  result: AppendSuccess,
  io: FileIo,
  root: string,
  diagnostic: Diagnose,
  ownership: ProcessOwnership,
): Promise<boolean> {
  io = trackFileIo(io, log.handles)
  const first = result.positions[0]
  if (first === undefined) throw new Error('judged append lost first position')
  const commit = Object.freeze({
    v: 1 as const,
    session: log.session,
    first,
    entries: request.entries,
  })
  const bytes = encodeCommitLine(commit)
  const nextState = foldCommit(log.state, commit)
  const start = log.rows[log.rows.length - 1]?.end ?? 0
  const created = log.file === undefined
  try {
    if (created) {
      await io.mkdir(log.dir)
      if (!log.markerOwned) {
        await syncDirectory(io, root)
        await replaceRecovery(io, log.dir, { v: 1, state: 'active', owner: ownership.current })
        log.markerOwned = true
      }
      log.file = await io.open(join(log.dir, 'entries.jsonl'), 'a+')
      log.needsDirectorySync = true
    }
    const file = log.file
    if (file === undefined) throw new Error('append file was not opened')
    if ((await file.write(bytes)) !== bytes.length) throw new IoFailure('partial-write')
    await file.datasync()
    if (log.needsDirectorySync) {
      await syncDirectory(io, log.dir)
      await syncDirectory(io, root)
      log.needsDirectorySync = false
    }
  } catch (error) {
    if (!isIoFailure(error)) throw error
    report(log, diagnostic, 'append')
    if (!log.markerOwned) log.healthy = false
    try {
      if (log.file !== undefined) {
        await log.file.truncate(start)
        await log.file.datasync()
      }
    } catch (repairError) {
      if (!isIoFailure(repairError)) throw repairError
      log.healthy = false
      report(log, diagnostic, 'repair')
    }
    return false
  }
  const row = indexRow(commit, start, start + bytes.length, log.rows.length === 0)
  log.state = nextState
  log.rows = Object.freeze([...log.rows, row])
  await appendIndex(log, row, io, diagnostic)
  return true
}
/** Called only with lifecycle ownership and no outstanding business tasks. */
export async function retireResident(
  log: Resident,
  io: FileIo,
  diagnostic: Diagnose,
): Promise<void> {
  let operation: SessionLogDiagnostic['operation'] = 'closeHandles'
  try {
    for (const file of log.handles) await file.close()
    io = trackFileIo(io, log.handles)
    if (!log.healthy || !log.markerOwned) return
    operation = 'indexSafety'
    const safe = log.indexSafe || (await rewriteIndex(log, io, diagnostic))
    // A failed metadata close cannot be hidden behind the delete-index alternative.
    for (const file of log.handles) await file.close()
    if (!safe) {
      try {
        await io.unlink(join(log.dir, 'index.jsonl'))
      } catch (error) {
        if (!isMissing(error)) throw error
      }
      await syncDirectory(io, log.dir)
      log.indexSafe = true
    }
    operation = 'markClean'
    await replaceRecovery(io, log.dir, { v: 1, state: 'clean' })
    log.markerOwned = false
    diagnostic(
      Object.freeze({
        level: 'warn',
        stage: 'close',
        sessionHash: log.hash,
        operation,
        outcome: 'completed',
      }),
    )
  } catch (error) {
    if (isIoFailure(error))
      diagnostic(
        Object.freeze({
          level: 'error',
          stage: 'close',
          sessionHash: log.hash,
          operation,
          outcome: 'failed',
        }),
      )
    throw error
  }
}
export async function readSnapshot(
  log: Resident,
  rows: readonly IndexRow[],
  matches: (entry: LogEntry) => boolean,
): Promise<readonly LogEntry[]> {
  const file = log.file
  if (file === undefined) return Object.freeze([])
  const entries: LogEntry[] = []
  for (const row of rows) {
    const decoded = decodeLogBytes(
      await file.read(row.start, row.end - row.start),
      log.session,
      row.first,
    )
    if (
      'failure' in decoded ||
      decoded.needsTruncation ||
      decoded.commits.length !== 1 ||
      decoded.commits[0]?.commit.entries.length !== row.count
    )
      throw new IoFailure('corrupt-read')
    const commit = decoded.commits[0]?.commit
    if (commit === undefined) throw new Error('decoded single row has no commit')
    for (const [index, item] of commit.entries.entries()) {
      const entry = Object.freeze({
        ...item,
        session: log.session,
        position: addInteger(commit.first, index),
      })
      if (matches(entry)) entries.push(entry)
    }
  }
  return Object.freeze(entries)
}
export function rowsSince(
  log: Resident,
  after: import('./types.ts').JsonNumber,
): readonly IndexRow[] {
  return Object.freeze(
    log.rows.filter(row => compareInteger(addInteger(row.first, row.count - 1), after) > 0),
  )
}
export function rowsByKey(log: Resident, key: string): readonly IndexRow[] {
  const positions = log.state.readPositions
    .filter(([readKey]) => readKey === key)
    .map(([, position]) => position)
  return Object.freeze(
    log.rows.filter(row =>
      positions.some(
        position =>
          compareInteger(position, row.first) >= 0 &&
          compareInteger(position, addInteger(row.first, row.count - 1)) <= 0,
      ),
    ),
  )
}
export const initialState = emptyLogState
