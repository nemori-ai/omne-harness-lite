import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SqlStorage } from '@omne-harness/sql-contract'

const WAL_HEADER_BYTES = 32
const WAL_FRAME_HEADER_BYTES = 24
const WAL_MAGIC = [0x377f0682, 0x377f0683]

export type WalFrame = Readonly<{ page: number; commit: boolean }>

export type WalCursor = Readonly<{ salt1: number; salt2: number; frames: number }>

export type WalDelta = Readonly<{
  pageSize: number
  frames: readonly WalFrame[]
  reset: boolean
}>

export function readWalDelta(
  file: string,
  cursor: WalCursor | null,
): { delta: WalDelta; cursor: WalCursor | null } {
  const none = { delta: { pageSize: 0, frames: [], reset: false }, cursor }
  if (!existsSync(file)) return none
  const fd = openSync(file, 'r')
  try {
    const size = statSync(file).size
    if (size < WAL_HEADER_BYTES) return none
    const header = Buffer.alloc(WAL_HEADER_BYTES)
    readSync(fd, header, 0, WAL_HEADER_BYTES, 0)
    if (!WAL_MAGIC.includes(header.readUInt32BE(0))) return none
    const pageSize = header.readUInt32BE(8)
    const salt1 = header.readUInt32BE(16)
    const salt2 = header.readUInt32BE(20)
    const sameRound = cursor !== null && cursor.salt1 === salt1 && cursor.salt2 === salt2
    const start = sameRound ? cursor.frames : 0
    const frameBytes = pageSize + WAL_FRAME_HEADER_BYTES
    const capacity = Math.floor((size - WAL_HEADER_BYTES) / frameBytes)
    const frames: WalFrame[] = []
    const frameHeader = Buffer.alloc(WAL_FRAME_HEADER_BYTES)
    for (let index = start; index < capacity; index += 1) {
      const at = WAL_HEADER_BYTES + index * frameBytes
      readSync(fd, frameHeader, 0, WAL_FRAME_HEADER_BYTES, at)
      if (frameHeader.readUInt32BE(8) !== salt1 || frameHeader.readUInt32BE(12) !== salt2) break
      frames.push({ page: frameHeader.readUInt32BE(0), commit: frameHeader.readUInt32BE(4) !== 0 })
    }
    return {
      delta: { pageSize, frames, reset: cursor !== null && !sameRound },
      cursor: { salt1, salt2, frames: start + frames.length },
    }
  } finally {
    closeSync(fd)
  }
}

export type CommandReading = Readonly<{ participant: string; bytes: number }>

export type CommitReading = Readonly<{
  seq: number
  step: number
  outcome: string
  commands: readonly CommandReading[]
  requestBytes: number
  pages: number
  fsyncs: number
  walReset: boolean
  file: string
  pageNumbers: readonly number[]
  entryRows: number
  entryBytes: number
  stateBytes: number
  tablePages: Readonly<Record<string, number>>
}>

export const JOURNAL_PARTICIPANT = 'execution-record'
export const SESSION_PARTICIPANT = 'session'

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

export type Recorder = ReturnType<typeof createRecorder>

export function createRecorder(storageRoot: string) {
  const readings: CommitReading[] = []
  let step = 0
  let pageSize = 0
  let queue: Promise<void> = Promise.resolve()
  const cursors = new Map<string, WalCursor | null>()
  const readers = new Map<string, DatabaseSync>()

  const domainFiles = (): string[] => {
    const dir = join(storageRoot, 'domains')
    return existsSync(dir)
      ? readdirSync(dir)
          .filter(name => name.endsWith('.sqlite'))
          .map(name => join(dir, name))
      : []
  }
  const reader = (file: string): DatabaseSync | null => {
    const known = readers.get(file)
    if (known !== undefined) return known
    try {
      const opened = new DatabaseSync(file, { readOnly: true })
      readers.set(file, opened)
      return opened
    } catch {
      return null
    }
  }
  const sessionTables = (file: string) => {
    const db = reader(file)
    if (db === null) return { entryRows: 0, entryBytes: 0, stateBytes: 0 }
    const count = (sql: string): Record<string, number> => {
      try {
        return Object.fromEntries(
          Object.entries(db.prepare(sql).get() ?? {}).map(([key, value]) => [key, Number(value)]),
        )
      } catch {
        return {}
      }
    }
    const entries = count('select count(*) as rows, coalesce(sum(bytes), 0) as bytes from sl_entry')
    const state = count(
      'select coalesce(sum(length(cast(snapshot as blob))), 0) as bytes from sl_state',
    )
    return {
      entryRows: entries['rows'] ?? 0,
      entryBytes: entries['bytes'] ?? 0,
      stateBytes: state['bytes'] ?? 0,
    }
  }
  const probeWal = () => {
    for (const file of domainFiles()) {
      const { delta, cursor } = readWalDelta(`${file}-wal`, cursors.get(file) ?? null)
      cursors.set(file, cursor)
      if (delta.pageSize !== 0) pageSize = delta.pageSize
      if (delta.frames.length > 0 || delta.reset) return { file, delta }
    }
    return { file: '', delta: { pageSize, frames: [], reset: false } as WalDelta }
  }
  const prime = (): void => {
    for (const file of domainFiles())
      if (!cursors.has(file)) cursors.set(file, readWalDelta(`${file}-wal`, null).cursor)
  }

  const recorder = {
    readings,
    setStep(value: number): void {
      step = value
    },
    get pageSize(): number {
      return pageSize
    },
    wrap(storage: SqlStorage): SqlStorage {
      return {
        ...storage,
        commit: (request, options) => {
          const atStep = step
          const run = queue.then(async () => {
            prime()
            const result = await storage.commit(request, options)
            const { file, delta } = probeWal()
            const session =
              file === '' ? { entryRows: 0, entryBytes: 0, stateBytes: 0 } : sessionTables(file)
            readings.push({
              seq: readings.length + 1,
              step: atStep,
              outcome: result.kind,
              commands: request.commands.map(command => ({
                participant: command.participant,
                bytes: bytesOf(command),
              })),
              requestBytes: bytesOf(request),
              pages: delta.frames.length,
              fsyncs: delta.frames.filter(frame => frame.commit).length,
              walReset: delta.reset,
              file,
              pageNumbers: delta.frames.map(frame => frame.page),
              ...session,
              tablePages: {},
            })
            return result
          })
          queue = run.then(
            () => undefined,
            () => undefined,
          )
          return run
        },
      }
    },
    finish(): void {
      const owners = new Map<string, Map<number, string>>()
      for (const file of new Set(readings.map(reading => reading.file))) {
        if (file === '') continue
        const db = reader(file)
        if (db === null) continue
        const map = new Map<number, string>()
        try {
          for (const row of db.prepare('select pageno, name from dbstat').all())
            map.set(Number(row['pageno']), tableOfBtree(String(row['name'])))
        } catch {}
        owners.set(file, map)
      }
      for (let index = 0; index < readings.length; index += 1) {
        const reading = readings[index]!
        const map = owners.get(reading.file)
        const tablePages: Record<string, number> = {}
        for (const page of reading.pageNumbers) {
          const table = map?.get(page) ?? 'unmapped'
          tablePages[table] = (tablePages[table] ?? 0) + 1
        }
        readings[index] = { ...reading, tablePages }
      }
      for (const db of readers.values()) db.close()
      readers.clear()
    },
  }
  return recorder
}

export function tableOfBtree(name: string): string {
  const auto = /^sqlite_autoindex_(.+)_\d+$/.exec(name)
  return auto === null ? name : auto[1]!
}

export function participantOfTable(table: string): string {
  if (table.startsWith('er_')) return JOURNAL_PARTICIPANT
  if (table.startsWith('sl_')) return SESSION_PARTICIPANT
  return 'other'
}

export type StepSummary = Readonly<{
  step: number
  commits: number
  rejected: number
  rejectedOwnBytes: number
  publications: number
  ownBytes: number
  maxPublicationBytes: number
  maxCommitBytes: number
  sessionBytes: number
  stateBytes: number
  stateRowBytes: number
  requestBytes: number
  pages: number
  fsyncs: number
  walResets: number
  tablePages: Readonly<Record<string, number>>
}>

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

export function summarizeSteps(readings: readonly CommitReading[]): StepSummary[] {
  const steps = [...new Set(readings.map(reading => reading.step))].sort((a, b) => a - b)
  return steps.map(step => {
    const all = readings.filter(reading => reading.step === step)
    const own = all.filter(reading => reading.outcome === 'committed')
    const journalBytes = (reading: CommitReading): number =>
      sum(
        reading.commands
          .filter(command => command.participant === JOURNAL_PARTICIPANT)
          .map(command => command.bytes),
      )
    const sessionJoined = own.filter(reading =>
      reading.commands.some(command => command.participant === SESSION_PARTICIPANT),
    )
    const tablePages: Record<string, number> = {}
    for (const reading of own)
      for (const [table, pages] of Object.entries(reading.tablePages))
        tablePages[table] = (tablePages[table] ?? 0) + pages
    return {
      step,
      commits: all.length,
      rejected: all.length - own.length,
      rejectedOwnBytes: sum(
        all.filter(reading => reading.outcome !== 'committed').map(journalBytes),
      ),
      publications: own.filter(reading => journalBytes(reading) > 0).length,
      ownBytes: sum(own.map(journalBytes)),
      maxPublicationBytes: Math.max(0, ...own.map(journalBytes)),
      maxCommitBytes: Math.max(0, ...own.map(reading => reading.requestBytes)),
      sessionBytes: sum(
        own.flatMap(reading =>
          reading.commands
            .filter(command => command.participant === SESSION_PARTICIPANT)
            .map(command => command.bytes),
        ),
      ),
      stateBytes: sum(sessionJoined.map(reading => reading.stateBytes)),
      stateRowBytes: sessionJoined.at(-1)?.stateBytes ?? 0,
      requestBytes: sum(own.map(reading => reading.requestBytes)),
      pages: sum(own.map(reading => reading.pages)),
      fsyncs: sum(own.map(reading => reading.fsyncs)),
      walResets: own.filter(reading => reading.walReset).length,
      tablePages,
    }
  })
}

export function ownToEntryRatio(readings: readonly CommitReading[]): number | null {
  const accepted = readings.filter(reading => reading.outcome === 'committed')
  const entryBytes = Math.max(0, ...accepted.map(reading => reading.entryBytes))
  if (entryBytes === 0) return null
  const own = sum(
    accepted.flatMap(reading =>
      reading.commands
        .filter(command => command.participant === JOURNAL_PARTICIPANT)
        .map(command => command.bytes),
    ),
  )
  return own / entryBytes
}

export const BOUNDED_PUBLICATION = { from: 5, to: 20, slackBytes: 2 * 1024 } as const

export type BoundedPublication = Readonly<{
  ok: boolean
  early: number | null
  late: number | null
  limit: number | null
}>

export function judgeBoundedPublication(
  steps: readonly StepSummary[],
  rule: { from: number; to: number; slackBytes: number } = BOUNDED_PUBLICATION,
): BoundedPublication {
  const early = steps.find(item => item.step === rule.from)?.maxPublicationBytes ?? null
  const late = steps.find(item => item.step === rule.to)?.maxPublicationBytes ?? null
  if (early === null || late === null) return { ok: false, early, late, limit: null }
  const limit = early + rule.slackBytes
  return { ok: late <= limit, early, late, limit }
}

export const LINEAR_OWN_BYTES = { j0Bytes: 64 * 1024, wBytesPerStep: 12 * 1024 } as const

export type LinearOwnBytes = Readonly<{ ok: boolean; total: number; limit: number; steps: number }>

export function judgeLinearOwnBytes(
  allSteps: readonly StepSummary[],
  rounds: number,
  rule: { j0Bytes: number; wBytesPerStep: number } = LINEAR_OWN_BYTES,
): LinearOwnBytes {
  const total = sum(allSteps.map(item => item.ownBytes))
  const limit = rule.j0Bytes + rule.wBytesPerStep * rounds
  const reached = allSteps.filter(item => item.step >= 1 && item.step <= rounds).length
  return { ok: reached === rounds && total <= limit, total, limit, steps: reached }
}

const kib = (bytes: number): string => (bytes / 1024).toFixed(1)

export function stepTable(steps: readonly StepSummary[]): string {
  const rows = steps.map(item =>
    [
      item.step,
      item.commits,
      item.rejected,
      item.publications,
      kib(item.ownBytes),
      kib(item.maxPublicationBytes),
      kib(item.sessionBytes),
      kib(item.stateRowBytes),
      item.pages,
      item.fsyncs,
    ].join(' | '),
  )
  return [
    '| 步 | 提交 | 被拒 | 发布 | 自有 KiB | 最大发布 KiB | Session KiB | sl_state 行 KiB | 页 | fsync |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row} |`),
  ].join('\n')
}
