// 测量设施：每次存储提交按参加者读出字节、页数、fsync 次数与每步提交次数，并算 Journal 自有字节对
// `sl_entry` 字节的比值。不导入 vitest；不访问网络。
//
// 读数从哪里来（各自只说明自己的范围）：
// - 逻辑字节：包住存储的 `commit`，对每个 command 取 JSON 文本的 UTF-8 字节数。参加者取 command 的
//   `participant`。`sl_state` 不在请求里（它是 Session 参加者在事务内重写的投影行），所以每次提交后读
//   那一行的大小，Session 参加者参加了的提交才算写了它。
// - 页数与 fsync：每次提交后读 SQLite 的 WAL 文件里新增的帧。一帧是一页；带提交标记的帧（db 页数字段非零）
//   是一次事务提交。sqlite-provider 打开库时把 `synchronous` 设成 FULL 并读回核对（`applyPragmas`），
//   WAL 模式下 FULL 在每次事务提交时同步一次 WAL，所以 fsync 次数取提交帧数。这是由配置推出的次数，不是
//   操作系统层的计数；检查点另计为 `walResets`。
// - 页属于哪张表：运行结束后用 `dbstat` 在最终库上把页号对到表。运行中被回收再分配给别的表的页按最终
//   所有者记，这是已知误差。
//
// 提交串行：包装器让存储提交一个接一个过，每次提交返回后立刻读 WAL，使新增帧只属于这一次提交。存储写者
// 本来就是单写，这不改变可见次序。
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SqlStorage } from '@omne-harness/sql-contract'

// --- WAL ---------------------------------------------------------------------------------------

const WAL_HEADER_BYTES = 32
const WAL_FRAME_HEADER_BYTES = 24
const WAL_MAGIC = [0x377f0682, 0x377f0683]

export type WalFrame = Readonly<{ page: number; commit: boolean }>

/** 读到哪里：WAL 头里的两个盐值标识一轮，`frames` 是这一轮已经读过的帧数。 */
export type WalCursor = Readonly<{ salt1: number; salt2: number; frames: number }>

export type WalDelta = Readonly<{
  pageSize: number
  frames: readonly WalFrame[]
  /** 自上次读以来 WAL 重启过（检查点之后开始新一轮），新帧从第 0 帧起算。 */
  reset: boolean
}>

/**
 * 读 WAL 文件里自 `cursor` 以来新增的有效帧。有效帧的盐值与头相同；遇到第一个无效帧就停（文件里留着上一轮
 * 的旧帧）。文件不存在或还没有头时没有新帧。
 */
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

// --- 读数 --------------------------------------------------------------------------------------

export type CommandReading = Readonly<{ participant: string; bytes: number }>

export type CommitReading = Readonly<{
  /** 提交的先后序号，从 1 起。 */
  seq: number
  /** 提交时世界所处的步，见 `Recorder.setStep`。 */
  step: number
  outcome: string
  commands: readonly CommandReading[]
  requestBytes: number
  /** 这次提交写进 WAL 的帧数，即页数。 */
  pages: number
  /** 其中带提交标记的帧数，即这次提交的 fsync 次数（`synchronous=FULL`）。 */
  fsyncs: number
  walReset: boolean
  /** 这次提交写到的库文件与页号，运行结束后对到表。 */
  file: string
  pageNumbers: readonly number[]
  /** 提交后 `sl_entry` 的行数与字节和，`sl_state` 那一行的字节数。 */
  entryRows: number
  entryBytes: number
  stateBytes: number
  /** 页号对到表之后的页数，按表名。运行结束前为空。 */
  tablePages: Readonly<Record<string, number>>
}>

export const JOURNAL_PARTICIPANT = 'execution-record'
export const SESSION_PARTICIPANT = 'session'

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

export type Recorder = ReturnType<typeof createRecorder>

/** 记录器：`wrap` 包住存储，`finish` 在运行结束后把页号对到表。 */
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
  /** 提交后 Session 两张表的状态；表还没建、库还打不开时是零。 */
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
  /** 这次提交写进哪个库文件、写了哪些帧。 */
  const probeWal = () => {
    for (const file of domainFiles()) {
      const { delta, cursor } = readWalDelta(`${file}-wal`, cursors.get(file) ?? null)
      cursors.set(file, cursor)
      if (delta.pageSize !== 0) pageSize = delta.pageSize
      if (delta.frames.length > 0 || delta.reset) return { file, delta }
    }
    return { file: '', delta: { pageSize, frames: [], reset: false } as WalDelta }
  }
  // 提交之前把已有的 WAL 帧读掉，让第一次提交只算自己的帧。
  const prime = (): void => {
    for (const file of domainFiles())
      if (!cursors.has(file)) cursors.set(file, readWalDelta(`${file}-wal`, null).cursor)
  }

  const recorder = {
    readings,
    /** 以后的提交记在第 `value` 步；世界在 Model 调用被受理时推进它。 */
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
    /** 把每次提交写到的页对到表（最终库上的 `dbstat`），关掉读连接。 */
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
        } catch {
          // 没有 dbstat 时页不分表，总页数仍然有效。
        }
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

/** 索引的 b 树名对到它的表：`sqlite_autoindex_<表>_<n>` 属于那张表；其余原样。 */
export function tableOfBtree(name: string): string {
  const auto = /^sqlite_autoindex_(.+)_\d+$/.exec(name)
  return auto === null ? name : auto[1]!
}

/** 表属于哪个参加者：`er_` 是 Journal 自己的表，`sl_` 是 Session 的。 */
export function participantOfTable(table: string): string {
  if (table.startsWith('er_')) return JOURNAL_PARTICIPANT
  if (table.startsWith('sl_')) return SESSION_PARTICIPANT
  return 'other'
}

// --- 按步汇总 ----------------------------------------------------------------------------------

export type StepSummary = Readonly<{
  step: number
  /** 存储提交次数，含被拒的。 */
  commits: number
  /** 含 Journal 参加者 command 的提交次数。 */
  publications: number
  /** Journal 自有字节：本步所有 `execution-record` command 的字节和。 */
  ownBytes: number
  /** 本步最大的一次发布：含 Journal command 的提交里 Journal command 的最大字节数。 */
  maxPublicationBytes: number
  /** 本步最大的一次提交：整个请求的字节数。 */
  maxCommitBytes: number
  sessionBytes: number
  /** `sl_state` 重写的字节：Session 参加者参加的每次提交后那一行的大小之和。 */
  stateBytes: number
  requestBytes: number
  pages: number
  fsyncs: number
  walResets: number
  /** 页数按表。 */
  tablePages: Readonly<Record<string, number>>
}>

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

export function summarizeSteps(readings: readonly CommitReading[]): StepSummary[] {
  const steps = [...new Set(readings.map(reading => reading.step))].sort((a, b) => a - b)
  return steps.map(step => {
    const own = readings.filter(reading => reading.step === step)
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
      commits: own.length,
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
      requestBytes: sum(own.map(reading => reading.requestBytes)),
      pages: sum(own.map(reading => reading.pages)),
      fsyncs: sum(own.map(reading => reading.fsyncs)),
      walResets: own.filter(reading => reading.walReset).length,
      tablePages,
    }
  })
}

/** Journal 自有字节对 `sl_entry` 字节的比值；`sl_entry` 为空时是 null。 */
export function ownToEntryRatio(readings: readonly CommitReading[]): number | null {
  const entryBytes = Math.max(0, ...readings.map(reading => reading.entryBytes))
  if (entryBytes === 0) return null
  const own = sum(
    readings.flatMap(reading =>
      reading.commands
        .filter(command => command.participant === JOURNAL_PARTICIPANT)
        .map(command => command.bytes),
    ),
  )
  return own / entryBytes
}

// --- 增长判据 ----------------------------------------------------------------------------------

/** 第 `to` 步的最大一次发布不超过第 `from` 步加 `slackBytes`（设计 12.3：第 20 轮对第 5 轮加 2 KB）。 */
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
  // 没跑到第 `to` 步就不算有界：缺读数判红，不当作通过。
  if (early === null || late === null) return { ok: false, early, late, limit: null }
  const limit = early + rule.slackBytes
  return { ok: late <= limit, early, late, limit }
}

/**
 * 累计自有字节的线性界：≤ J0 + W × 轮数（设计 3.1）。W 取 12 KiB 每生产者轮；J0 取 64 KiB。两个常数是第一版
 * 的初值：终态 provider 合入后测出 J0，W 改为实测值加 25% 余量（R2-D294）。
 */
export const LINEAR_OWN_BYTES = { j0Bytes: 64 * 1024, wBytesPerStep: 12 * 1024 } as const

export type LinearOwnBytes = Readonly<{ ok: boolean; total: number; limit: number; steps: number }>

/** `rounds` 是跑完的工具步数（不含起步与收尾那两个桶）。 */
export function judgeLinearOwnBytes(
  allSteps: readonly StepSummary[],
  rounds: number,
  rule: { j0Bytes: number; wBytesPerStep: number } = LINEAR_OWN_BYTES,
): LinearOwnBytes {
  const total = sum(allSteps.map(item => item.ownBytes))
  const limit = rule.j0Bytes + rule.wBytesPerStep * rounds
  const reached = allSteps.filter(item => item.step >= 1 && item.step <= rounds).length
  // 没跑满的运行不能用「已写的那点字节」证明有界。
  return { ok: reached === rounds && total <= limit, total, limit, steps: reached }
}

// --- 报告 --------------------------------------------------------------------------------------

const kib = (bytes: number): string => (bytes / 1024).toFixed(1)

/** 一张按步的 Markdown 表，供 `perf-baseline.md` 引用。 */
export function stepTable(steps: readonly StepSummary[]): string {
  const rows = steps.map(item =>
    [
      item.step,
      item.commits,
      item.publications,
      kib(item.ownBytes),
      kib(item.maxPublicationBytes),
      kib(item.sessionBytes),
      kib(item.stateBytes),
      item.pages,
      item.fsyncs,
    ].join(' | '),
  )
  return [
    '| 步 | 提交 | 发布 | 自有 KiB | 最大发布 KiB | Session KiB | sl_state KiB | 页 | fsync |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row} |`),
  ].join('\n')
}
