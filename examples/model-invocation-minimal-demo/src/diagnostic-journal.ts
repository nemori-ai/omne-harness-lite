import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { constants } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {DiagnosticCloseResult, DiagnosticCollectorConfig, DiagnosticCoverage, DiagnosticExportLimits, DiagnosticExportResult, DiagnosticJournalStore, DiagnosticQuery, DiagnosticQueryResult, DiagnosticRecord, DiagnosticScope} from '@omne-harness-lite/model-request-runtime-local'
import type { DiagnosticReference } from '@omne-harness-lite/model-request-runtime'

type FileHandle = Awaited<ReturnType<typeof nodeFs.open>>
type FileSystem = Pick<typeof nodeFs, 'mkdir' | 'lstat' | 'readdir' | 'unlink' | 'open'>

export interface DiagnosticJournalConfig extends Pick<
  DiagnosticCollectorConfig,
  | 'collectorId'
  | 'scope'
  | 'maxRecordBytes'
  | 'segmentMaxBytes'
  | 'retainedMaxBytes'
  | 'retainedMaxSegments'
  | 'retentionMs'
  | 'queryMaxRecords'
  | 'queryMaxBytes'
  | 'queryScanMaxBytes'
  | 'queryConcurrency'
  | 'queryMaxDurationMs'
  | 'exportMaxRecords'
  | 'exportMaxBytes'
  | 'wallClock'
  | 'monotonicClock'
  | 'schedule'
> {
  /** Existing private directory, or a new one created with mode 0700. */
  readonly rootDir: string
  /** Test seam for exact filesystem failure and late I/O ownership evidence. */
  readonly fs?: FileSystem
}

interface Line {
  readonly sequence: bigint
  readonly offset: number
  readonly bytes: number
  readonly observedAt?: string
}

interface Segment {
  readonly name: string
  readonly path: string
  readonly lines: Line[]
  bytes: number
  lastMonotonic?: number
  readers: number
  closed: boolean
}

type Rejection = Extract<DiagnosticQueryResult, { readonly rejected: string }>
const unreadable: Rejection = { rejected: 'unavailable' }

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function sameScope(a: DiagnosticScope, b: DiagnosticScope): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === 'local' || (b.kind === 'tenant' && tenantIdEquals(a.tenant, b.tenant)))
  )
}

function ownData(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return null
    const copied: Record<string, unknown> = {}
    for (const key of keys) {
      if (typeof key !== 'string') return null
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      Object.defineProperty(copied, key, { value: descriptor.value, enumerable: true })
    }
    return copied
  } catch {
    return null
  }
}

function ownScope(value: unknown): DiagnosticScope | null {
  const item = ownData(value, ['kind', 'tenant'])
  if (!item) return null
  if (item.kind === 'local' && !Object.hasOwn(item, 'tenant'))
    return Object.freeze({ kind: 'local' })
  if (item.kind !== 'tenant') return null
  const pair = ownData(item.tenant, ['organization', 'account'])
  if (!pair) return null
  const parsed = parseTenantId(pair)
  return 'ok' in parsed ? Object.freeze({ kind: 'tenant', tenant: Object.freeze(parsed.ok) }) : null
}

function sequenceOf(
  value: DiagnosticReference | undefined,
  collectorId: string,
  emptyThrough = false,
): bigint | null {
  if (value === undefined) return 0n
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.keys(value).length !== 2 ||
    value.collectorId !== collectorId ||
    typeof value.sequence !== 'string' ||
    (!(emptyThrough && value.sequence === '0') && !/^[1-9][0-9]*$/u.test(value.sequence))
  )
    return null
  return BigInt(value.sequence)
}

function reference(collectorId: string, sequence: bigint): DiagnosticReference {
  return { collectorId, sequence: sequence.toString() }
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

async function checkedDirectory(fs: FileSystem, path: string, create: boolean): Promise<void> {
  if (create) {
    try {
      await fs.mkdir(path, { mode: 0o700 })
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw new Error('diagnostic directory unavailable')
    }
  }
  const stat = await fs.lstat(path)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700)
    throw new Error('diagnostic directory permissions invalid')
}

async function checkedFile(handle: FileHandle): Promise<void> {
  const stat = await handle.stat()
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
    throw new Error('diagnostic file permissions invalid')
}

function validatedConfig(input: DiagnosticJournalConfig): DiagnosticJournalConfig {
  const scope = ownScope(input.scope)
  if (
    process.platform === 'win32' ||
    process.getuid === undefined ||
    typeof input.rootDir !== 'string' ||
    !isAbsolute(input.rootDir) ||
    input.rootDir.includes('\0') ||
    typeof input.collectorId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.collectorId) ||
    !scope ||
    [
      input.maxRecordBytes,
      input.segmentMaxBytes,
      input.retainedMaxBytes,
      input.retainedMaxSegments,
      input.retentionMs,
      input.queryMaxRecords,
      input.queryMaxBytes,
      input.queryScanMaxBytes,
      input.queryConcurrency,
      input.queryMaxDurationMs,
      input.exportMaxRecords,
      input.exportMaxBytes,
    ].some(value => !positive(value)) ||
    input.maxRecordBytes > input.segmentMaxBytes ||
    input.segmentMaxBytes > input.retainedMaxBytes ||
    input.maxRecordBytes > input.queryMaxBytes ||
    input.maxRecordBytes > input.exportMaxBytes ||
    input.maxRecordBytes > input.queryScanMaxBytes ||
    typeof input.wallClock !== 'function' ||
    typeof input.monotonicClock !== 'function' ||
    typeof input.schedule !== 'function'
  )
    throw new Error('invalid diagnostic journal configuration')
  return Object.freeze({ ...input, scope })
}

function readClock(config: DiagnosticJournalConfig): number | undefined {
  try {
    const value = config.wallClock().getTime()
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

function monotonic(config: DiagnosticJournalConfig): number | undefined {
  try {
    const value = config.monotonicClock()
    return Number.isFinite(value) && value >= 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** A single writer or a read-only reopened instance; no business log is touched. */
export async function createDiagnosticJournal(
  input: DiagnosticJournalConfig,
): Promise<DiagnosticJournalStore> {
  return openJournal(input, false)
}

/** Reopen an old instance only for bounded engineering queries. Never reacquires its writer. */
export async function openDiagnosticJournalReader(
  input: DiagnosticJournalConfig,
): Promise<DiagnosticJournalStore> {
  return openJournal(input, true)
}

async function openJournal(
  input: DiagnosticJournalConfig,
  readOnly: boolean,
): Promise<DiagnosticJournalStore> {
  const config = validatedConfig(input)
  const fs = config.fs ?? nodeFs
  await checkedDirectory(fs, config.rootDir, !readOnly)
  const dir = join(config.rootDir, config.collectorId)
  if (readOnly) await checkedDirectory(fs, dir, false)
  else {
    try {
      await fs.mkdir(dir, { mode: 0o700 })
    } catch {
      throw new Error('diagnostic collector directory already exists or unavailable')
    }
    await checkedDirectory(fs, dir, false)
  }

  const segments: Segment[] = []
  let writer: FileHandle | undefined
  let writerFailed = false
  let closed = readOnly
  let closing = false
  let pendingWrites = 0
  let pendingQueries = 0
  let pendingQueryIo = 0
  let openQueryHandles = 0
  let pendingQueryCloses = 0
  let timedOutQueries: number | 'unknown' = 0
  let queryCloseFailures: number | 'unknown' = 0
  let expired: number | 'unknown' = readOnly ? 'unknown' : 0
  let expiredBytes: number | 'unknown' = readOnly ? 'unknown' : 0
  let evicted: number | 'unknown' = readOnly ? 'unknown' : 0
  let evictedBytes: number | 'unknown' = readOnly ? 'unknown' : 0
  let retainedBytes = 0
  let retainedKnown = true
  let coverage: DiagnosticCoverage = readOnly ? 'unknown' : 'complete'
  let written = 0n
  let damaged = false
  let appendTail: Promise<void> = Promise.resolve()
  let closeTask: Promise<DiagnosticCloseResult> | undefined
  let retentionTimer: { readonly cancel: () => void } | undefined
  const queryTasks = new Set<Promise<void>>()
  const stopQueries = new Set<() => void>()

  function bump(value: number | 'unknown', by = 1): number | 'unknown' {
    return value === 'unknown' || !Number.isSafeInteger(value + by) ? 'unknown' : value + by
  }

  function oldest(): string | undefined {
    return segments[0]?.lines[0]?.sequence.toString()
  }

  function snapshot(): ReturnType<DiagnosticJournalStore['health']> {
    const oldestAvailableSequence = oldest()
    return Object.freeze({
      pendingQueries,
      pendingQueryIo,
      openQueryHandles,
      pendingQueryCloses,
      timedOutQueries,
      queryCloseFailures,
      expired,
      expiredBytes,
      evicted,
      evictedBytes,
      retainedBytes: retainedKnown ? retainedBytes : 'unknown',
      retainedRecords:
        retainedKnown && !damaged
          ? segments.reduce((total, segment) => total + segment.lines.length, 0)
          : 'unknown',
      retainedSegments: segments.length,
      ...(oldestAvailableSequence === undefined ? {} : { oldestAvailableSequence }),
      coverage,
    })
  }

  async function io<T>(work: () => Promise<T>): Promise<T> {
    pendingQueryIo++
    try {
      return await work()
    } finally {
      pendingQueryIo--
    }
  }

  async function closeRead(handle: FileHandle, segment: Segment): Promise<boolean> {
    pendingQueryCloses++
    try {
      await io(() => handle.close())
      openQueryHandles--
      segment.readers--
      return true
    } catch {
      queryCloseFailures = bump(queryCloseFailures)
      coverage = 'degraded'
      return false
    } finally {
      pendingQueryCloses--
    }
  }

  async function eraseOldest(reason: 'expired' | 'evicted'): Promise<boolean> {
    const segment = segments[0]
    if (!segment || !segment.closed || segment.readers !== 0) return false
    try {
      await fs.unlink(segment.path)
    } catch {
      coverage = 'degraded'
      return false
    }
    segments.shift()
    retainedBytes -= segment.bytes
    if (reason === 'expired') {
      expired = bump(expired, segment.lines.length)
      expiredBytes = bump(expiredBytes, segment.bytes)
    } else {
      evicted = bump(evicted, segment.lines.length)
      evictedBytes = bump(evictedBytes, segment.bytes)
    }
    coverage = 'degraded'
    return true
  }

  async function expire(): Promise<void> {
    const now = monotonic(config)
    if (now === undefined) {
      coverage = 'unknown'
      return
    }
    const current = segments.at(-1)
    if (current?.lastMonotonic !== undefined && now < current.lastMonotonic) {
      coverage = 'unknown'
      return
    }
    if (
      current &&
      !current.closed &&
      current.lastMonotonic !== undefined &&
      now - current.lastMonotonic >= config.retentionMs
    ) {
      try {
        await writer?.close()
        writer = undefined
        current.closed = true
      } catch {
        writerFailed = true
        retainedKnown = false
        coverage = 'unknown'
        return
      }
    }
    while (
      segments[0]?.closed &&
      segments[0].lastMonotonic !== undefined &&
      now - segments[0].lastMonotonic >= config.retentionMs
    ) {
      if (!(await eraseOldest('expired'))) break
    }
  }

  function scheduleRetention(): void {
    if (closed || closing || writerFailed) return
    try {
      retentionTimer = config.schedule(config.retentionMs, () => {
        retentionTimer = undefined
        const task = appendTail.then(expire)
        appendTail = task.then(
          () => undefined,
          () => {
            coverage = 'degraded'
          },
        )
        void task.then(scheduleRetention, scheduleRetention)
      })
    } catch {
      coverage = 'unknown'
    }
  }

  async function openWriteSegment(first: bigint): Promise<Segment> {
    const name = `segment-${first.toString().padStart(20, '0')}.jsonl`
    const path = join(dir, name)
    const handle = await fs.open(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await checkedFile(handle)
    } catch (error) {
      await handle.close().catch(() => {
        writerFailed = true
      })
      throw error
    }
    writer = handle
    const segment: Segment = { name, path, lines: [], bytes: 0, readers: 0, closed: false }
    segments.push(segment)
    return segment
  }

  async function appendOne(record: DiagnosticRecord): Promise<'written' | 'retention_full'> {
    if (closed || closing || writerFailed) throw new Error('diagnostic writer unavailable')
    if (record.collectorId !== config.collectorId || !sameScope(config.scope, record.scope))
      throw new Error('diagnostic record scope invalid')
    const sequence = sequenceOf(
      { collectorId: record.collectorId, sequence: record.sequence },
      config.collectorId,
    )
    if (sequence === null || sequence <= written) throw new Error('diagnostic sequence invalid')
    const text = `${writeJsonLossless(record)}\n`
    const bytes = Buffer.byteLength(text)
    if (bytes > config.maxRecordBytes || bytes > config.segmentMaxBytes)
      throw new Error('diagnostic record exceeds configured bound')
    await expire()
    let current = segments.at(-1)
    if (current && current.bytes + bytes > config.segmentMaxBytes) {
      if (writer) await writer.close()
      writer = undefined
      current.closed = true
      current = undefined
    }
    if (current && retainedBytes + bytes > config.retainedMaxBytes) {
      if (writer) await writer.close()
      writer = undefined
      current.closed = true
      current = undefined
    }
    while (
      retainedBytes + bytes > config.retainedMaxBytes ||
      segments.length + (current ? 0 : 1) > config.retainedMaxSegments
    ) {
      if (!(await eraseOldest('evicted'))) return 'retention_full'
    }
    if (!current) current = await openWriteSegment(sequence)
    const line = Buffer.from(text)
    let offset = 0
    while (offset < bytes) {
      const result = await writer!.write(line, offset, bytes - offset, current.bytes + offset)
      if (result.bytesWritten <= 0) throw new Error('diagnostic write incomplete')
      offset += result.bytesWritten
    }
    current.lines.push({
      sequence,
      offset: current.bytes,
      bytes,
      ...(record.observedAt === undefined ? {} : { observedAt: record.observedAt }),
    })
    current.bytes += bytes
    const at = monotonic(config)
    if (at === undefined) coverage = 'unknown'
    else current.lastMonotonic = at
    retainedBytes += bytes
    written = sequence
    return 'written'
  }

  function append(record: DiagnosticRecord): Promise<'written' | 'retention_full'> {
    // Own data before validation or the asynchronous append boundary. Accessors
    // cannot execute, and later caller mutation cannot change a queued record.
    const copied = copyJsonValue(record)
    const candidate = 'ok' in copied ? object(copied.ok) : null
    if (!candidate || !validStoredRecord(candidate, config.collectorId, config.scope))
      return Promise.reject(new Error('diagnostic record invalid'))
    pendingWrites++
    const task = appendTail.then(() => appendOne(candidate as unknown as DiagnosticRecord))
    appendTail = task.then(
      () => undefined,
      () => {
        writerFailed = true
        retainedKnown = false
        damaged = true
        coverage = 'unknown'
      },
    )
    return task.finally(() => {
      pendingWrites--
    })
  }

  async function flush(): Promise<void> {
    await appendTail
    if (readOnly || writerFailed) throw new Error('diagnostic writer unavailable')
    if (writer) await writer.sync()
  }

  // Reopened instances derive their index from persisted complete lines. A damaged line stays damaged.
  if (readOnly) {
    const names = (await fs.readdir(dir))
      .filter(name => /^segment-[0-9]+\.jsonl$/u.test(name))
      .sort()
    if (names.length > config.retainedMaxSegments)
      throw new Error('diagnostic retained segment bound exceeded')
    for (const name of names) {
      const path = join(dir, name)
      const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        await checkedFile(handle)
        const stat = await handle.stat()
        if (
          stat.size > config.segmentMaxBytes ||
          retainedBytes + stat.size > config.retainedMaxBytes
        )
          throw new Error('diagnostic retained byte bound exceeded')
        const data = Buffer.alloc(stat.size)
        let offset = 0
        while (offset < stat.size) {
          const { bytesRead } = await handle.read(data, offset, stat.size - offset, offset)
          if (bytesRead <= 0) throw new Error('diagnostic segment incomplete')
          offset += bytesRead
        }
        const segment: Segment = {
          name,
          path,
          lines: [],
          bytes: stat.size,
          readers: 0,
          closed: true,
        }
        let start = 0
        for (let end = 0; end < data.length; end++) {
          if (data[end] !== 10) continue
          const line = data.subarray(start, end).toString('utf8')
          const parsed = parseLine(line, config.collectorId, config.scope)
          if (!parsed || parsed.sequence <= written) {
            damaged = true
            coverage = 'degraded'
            break
          }
          const bytes = end + 1 - start
          if (bytes > config.maxRecordBytes) {
            damaged = true
            coverage = 'degraded'
            break
          }
          segment.lines.push({
            sequence: parsed.sequence,
            offset: start,
            bytes,
            ...(parsed.record.observedAt === undefined
              ? {}
              : { observedAt: parsed.record.observedAt }),
          })
          written = parsed.sequence
          start = end + 1
        }
        if (start !== data.length) {
          damaged = true
          coverage = 'degraded'
        }
        retainedBytes += stat.size
        segments.push(segment)
      } finally {
        await handle.close()
      }
    }
  } else scheduleRetention()

  function validateQuery(
    value: DiagnosticQuery,
    limits?: DiagnosticExportLimits,
  ):
    | {
        readonly after: bigint
        readonly through: bigint
        readonly limit: number
        readonly maxBytes: number
      }
    | Rejection {
    const requestedScope = ownScope(value?.scope)
    if (!requestedScope || !sameScope(config.scope, requestedScope))
      return { rejected: 'forbidden' }
    const after = sequenceOf(value.after, config.collectorId)
    const through =
      value.through === undefined ? written : sequenceOf(value.through, config.collectorId, true)
    if (
      after === null ||
      through === null ||
      after > through ||
      !positive(value.limit) ||
      value.limit > config.queryMaxRecords ||
      !positive(value.maxBytes) ||
      value.maxBytes < config.maxRecordBytes ||
      value.maxBytes > config.queryMaxBytes ||
      (limits !== undefined &&
        (!positive(limits.maxRecords) ||
          limits.maxRecords > config.exportMaxRecords ||
          !positive(limits.maxBytes) ||
          limits.maxBytes < config.maxRecordBytes ||
          limits.maxBytes > config.exportMaxBytes))
    )
      return { rejected: 'invalidInput' }
    return {
      after,
      through,
      limit: Math.min(value.limit, limits?.maxRecords ?? value.limit),
      maxBytes: Math.min(value.maxBytes, limits?.maxBytes ?? value.maxBytes),
    }
  }

  async function scan(
    checked: {
      readonly after: bigint
      readonly through: bigint
      readonly limit: number
      readonly maxBytes: number
    },
    stopped: () => boolean,
    markLeak: () => void,
  ): Promise<DiagnosticQueryResult> {
    if (damaged) return { rejected: 'corrupt' }
    const first = segments[0]?.lines[0]?.sequence
    if (first !== undefined && checked.after !== 0n && checked.after < first - 1n)
      return {
        rejected: 'cursor_expired',
        earliest: reference(config.collectorId, first),
        coverage: 'degraded',
      }
    if (first === undefined && checked.after !== 0n)
      return { rejected: 'cursor_expired', coverage: 'degraded' }
    const now = readClock(config)
    if (now === undefined) {
      coverage = 'unknown'
      return unreadable
    }
    const records: DiagnosticRecord[] = []
    let outputBytes = 0
    let scannedBytes = 0
    let lastScanned = checked.after
    let pageCoverage: DiagnosticCoverage = coverage
    let pageFull = false
    for (const segment of segments) {
      const candidates = segment.lines.filter(
        line => line.sequence > checked.after && line.sequence <= checked.through,
      )
      if (candidates.length === 0) continue
      if (stopped()) return unreadable
      segment.readers++
      let handle: FileHandle | undefined
      let closedHandle = false
      try {
        handle = await io(() => fs.open(segment.path, constants.O_RDONLY | constants.O_NOFOLLOW))
        openQueryHandles++
        if (stopped()) return unreadable
        await checkedFile(handle)
        for (const line of candidates) {
          if (stopped()) return unreadable
          if (
            records.length >= checked.limit ||
            outputBytes + line.bytes > checked.maxBytes ||
            scannedBytes + line.bytes > config.queryScanMaxBytes
          ) {
            pageFull = true
            break
          }
          const data = Buffer.alloc(line.bytes)
          const result = await io(() => handle!.read(data, 0, line.bytes, line.offset))
          if (stopped()) return unreadable
          if (result.bytesRead !== line.bytes || data.at(-1) !== 10) return { rejected: 'corrupt' }
          const parsed = parseLine(
            data.subarray(0, -1).toString('utf8'),
            config.collectorId,
            config.scope,
          )
          if (!parsed || parsed.sequence !== line.sequence) return { rejected: 'corrupt' }
          scannedBytes += line.bytes
          lastScanned = line.sequence
          const observed = Date.parse(parsed.record.observedAt ?? '')
          if (!Number.isFinite(observed) || observed > now) {
            coverage = 'unknown'
            return unreadable
          }
          if (now - observed >= config.retentionMs) {
            pageCoverage = 'degraded'
            coverage = 'degraded'
            continue
          }
          records.push(parsed.record)
          outputBytes += line.bytes
        }
      } catch {
        coverage = 'degraded'
        return unreadable
      } finally {
        if (handle) {
          closedHandle = await closeRead(handle, segment)
          if (!closedHandle) markLeak()
        } else segment.readers--
      }
      if (!closedHandle) return unreadable
      if (
        pageFull ||
        records.length >= checked.limit ||
        scannedBytes >= config.queryScanMaxBytes ||
        outputBytes >= checked.maxBytes
      )
        break
    }
    if (stopped()) return unreadable
    return {
      page: {
        records,
        through: reference(config.collectorId, checked.through),
        ...(lastScanned < checked.through
          ? { next: reference(config.collectorId, lastScanned) }
          : {}),
        coverage: pageCoverage,
      },
    }
  }

  async function runPage(
    query: DiagnosticQuery,
    limits?: DiagnosticExportLimits,
  ): Promise<DiagnosticQueryResult> {
    const checked = validateQuery(query, limits)
    if ('rejected' in checked) return checked
    if (closing) return { rejected: 'busy' }
    if (pendingQueries >= config.queryConcurrency) return { rejected: 'busy' }
    pendingQueries++
    let stopped = false
    let timer: { readonly cancel: () => void } | undefined
    let stop!: () => void
    const stopResult = new Promise<DiagnosticQueryResult>(resolve => {
      stop = () => {
        stopped = true
        resolve(unreadable)
      }
    })
    stopQueries.add(stop)
    const task = (async () => {
      let release = true
      try {
        const result = await scan(
          checked,
          () => stopped || closing,
          () => {
            release = false
          },
        )
        return result
      } finally {
        stopQueries.delete(stop)
        if (release) pendingQueries--
      }
    })()
    const owner = task.then(
      () => undefined,
      () => undefined,
    )
    queryTasks.add(owner)
    void owner.finally(() => queryTasks.delete(owner))
    const timeout = new Promise<DiagnosticQueryResult>(resolve => {
      try {
        timer = config.schedule(config.queryMaxDurationMs, () => {
          timedOutQueries = bump(timedOutQueries)
          coverage = 'degraded'
          stopped = true
          resolve({ rejected: 'timeout' })
        })
      } catch {
        stopped = true
        coverage = 'unknown'
        resolve(unreadable)
      }
    })
    try {
      const result = await Promise.race([task, timeout, stopResult])
      return result
    } finally {
      try {
        timer?.cancel()
      } catch {
        coverage = 'unknown'
      }
    }
  }

  async function exportPage(
    query: DiagnosticQuery,
    limits: DiagnosticExportLimits,
  ): Promise<DiagnosticExportResult> {
    if (limits === undefined || limits === null) return { rejected: 'invalidInput' }
    const result = await runPage(query, limits)
    if ('rejected' in result) return result
    return {
      page: {
        jsonl: result.page.records.map(item => `${writeJsonLossless(item)}\n`).join(''),
        through: result.page.through,
        ...(result.page.next ? { next: result.page.next } : {}),
        coverage: result.page.coverage,
      },
    }
  }

  async function close(): Promise<DiagnosticCloseResult> {
    if (closeTask) return closeTask
    closing = true
    try {
      retentionTimer?.cancel()
    } catch {
      coverage = 'unknown'
    }
    for (const stop of stopQueries) stop()
    closeTask = (async () => {
      await appendTail
      let flushFailed = writerFailed
      if (writer) {
        try {
          await writer.sync()
        } catch {
          flushFailed = true
          coverage = 'degraded'
        }
        try {
          await writer.close()
          writer = undefined
          const last = segments.at(-1)
          if (last) last.closed = true
        } catch {
          coverage = 'degraded'
        }
      }
      await Promise.allSettled([...queryTasks])
      if (!readOnly) await expire()
      const resourcesOpen = writer !== undefined || openQueryHandles > 0
      if (resourcesOpen || pendingQueries > 0 || flushFailed) {
        coverage = 'degraded'
        return {
          incomplete: {
            pendingWrites,
            pendingSinks: 0,
            pendingQueries,
            pendingQueryIo,
            openQueryHandles,
            pendingQueryCloses,
            queryCloseFailures,
            flushFailed,
            resourcesOpen,
          },
          coverage,
        } as const
      }
      closed = true
      closing = false
      return { complete: true, coverage } as const
    })().finally(() => {
      if (!closed) closeTask = undefined
    })
    return closeTask
  }

  return Object.freeze({
    append,
    flush,
    query: (query: DiagnosticQuery) => runPage(query),
    exportPage,
    close,
    health: snapshot,
  })
}

function parseLine(
  text: string,
  collectorId: string,
  scope: DiagnosticScope,
): { readonly record: DiagnosticRecord; readonly sequence: bigint } | null {
  const parsed = readJsonStrict(text)
  if (
    'failed' in parsed ||
    parsed.ok === null ||
    typeof parsed.ok !== 'object' ||
    Array.isArray(parsed.ok)
  )
    return null
  const value = parsed.ok as Record<string, unknown>
  if (!validStoredRecord(value, collectorId, scope)) return null
  return { record: value as unknown as DiagnosticRecord, sequence: BigInt(value.sequence) }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function only(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function strings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => value[key] === undefined || typeof value[key] === 'string')
}

function optionalEnum(
  value: Record<string, unknown>,
  key: string,
  choices: readonly string[],
): boolean {
  return value[key] === undefined || choices.includes(String(value[key]))
}

/** Same closed planning projection as the collector; no raw measurement/configuration values. */
function validMeasurementFacts(value: Record<string, unknown>): boolean {
  const basis = object(value.basis),
    source = object(value.calibrationSource)
  const basisKeys = [
    'model',
    'provider',
    'tokenizerRevision',
    'meterRevision',
    'replayRevision',
    'transformRevision',
    'projectionRevision',
  ]
  const precision = (v: unknown) => ['exact', 'upperBound', 'estimated'].some(p => p === v)
  const nonempty = (v: unknown) => typeof v === 'string' && v.length > 0
  const integer = (v: unknown, signed = false) =>
    isJsonNumber(v) &&
    (typeof v !== 'number' || Number.isSafeInteger(v)) &&
    ExactDecimal.from(v).isInteger &&
    (signed || ExactDecimal.from(v).compare(ExactDecimal.from(0)) >= 0)
  const contribution = (v: unknown, signed: boolean) => {
    const item = object(v)
    return (
      !!item &&
      only(item, ['tokens', 'precision']) &&
      precision(item.precision) &&
      integer(item.tokens, signed)
    )
  }
  if (
    !only(value, [
      'kind',
      'mode',
      'fallbackReason',
      'basis',
      'precision',
      'predictedInput',
      'admissionTokens',
      'fullContribution',
      'replayContribution',
      'newContribution',
      'calibrationSource',
    ]) ||
    !basis ||
    !only(basis, basisKeys) ||
    !basisKeys.every(key => nonempty(basis[key])) ||
    !precision(value.precision) ||
    !integer(value.predictedInput) ||
    !integer(value.admissionTokens) ||
    !source
  )
    return false
  if (source.kind === 'none') {
    if (
      !only(source, ['kind', 'reason']) ||
      !['no_observation', 'source_unavailable'].some(v => v === source.reason)
    )
      return false
  } else if (source.kind === 'observation') {
    if (
      !only(source, ['kind', 'observedInputKind', 'requestInput']) ||
      !['from_usage', 'upstream_total', 'unavailable'].some(v => v === source.observedInputKind)
    )
      return false
    if (source.requestInput !== undefined) {
      const prior = object(source.requestInput)
      if (
        !prior ||
        !only(prior, [
          'projectionRevision',
          'prefixBoundary',
          'prefixDigest',
          'inputEnvelopeDigest',
        ]) ||
        !nonempty(prior.projectionRevision) ||
        !integer(prior.prefixBoundary) ||
        ![prior.prefixDigest, prior.inputEnvelopeDigest].every(
          v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v),
        )
      )
        return false
    }
  } else return false
  if (value.mode === 'full')
    return (
      value.replayContribution === undefined &&
      value.newContribution === undefined &&
      (value.fallbackReason === undefined ||
        ['no_observation', 'source_unavailable', 'prefix_changed', 'basis_changed'].some(
          v => v === value.fallbackReason,
        )) &&
      contribution(value.fullContribution, false)
    )
  return (
    value.mode === 'marginal' &&
    value.fallbackReason === undefined &&
    value.fullContribution === undefined &&
    contribution(value.replayContribution, true) &&
    contribution(value.newContribution, true)
  )
}

function validStoredRecord(
  value: Record<string, unknown>,
  collectorId: string,
  scope: DiagnosticScope,
): value is Record<string, unknown> & { sequence: string } {
  const storedScope = ownScope(value.scope)
  if (
    !only(value, [
      'format',
      'collectorId',
      'sequence',
      'scope',
      'source',
      'stage',
      'outcome',
      'facts',
      'binding',
      'association',
      'observedAt',
      'elapsedMs',
    ]) ||
    value.format !== 'model-diagnostics/1' ||
    value.collectorId !== collectorId ||
    !storedScope ||
    !sameScope(storedScope, scope) ||
    typeof value.sequence !== 'string' ||
    !/^[1-9][0-9]*$/u.test(value.sequence) ||
    !['runtime', 'invocation', 'transport', 'observer', 'assembly'].includes(
      String(value.source),
    ) ||
    ![
      'started',
      'waiting',
      'accepted',
      'rejected',
      'unavailable',
      'completed',
      'failed',
      'cancel_requested',
      'stopped',
      'unknown',
      'dropped',
    ].includes(String(value.outcome)) ||
    (value.observedAt !== undefined &&
      (typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt)))) ||
    (value.elapsedMs !== undefined &&
      (!isJsonNumber(value.elapsedMs) || jsonNumberSource(value.elapsedMs).startsWith('-')))
  )
    return false
  const binding = value.binding === undefined ? undefined : object(value.binding)
  if (
    value.binding !== undefined &&
    (!binding ||
      !only(binding, [
        'profile',
        'implementation',
        'implementationRevision',
        'modelId',
        'definitionRevision',
        'configurationRevision',
      ]) ||
      !strings(binding, Object.keys(binding)))
  )
    return false
  const association = value.association === undefined ? undefined : object(value.association)
  if (
    value.association !== undefined &&
    (!association ||
      !only(association, [
        'executionId',
        'causedBy',
        'session',
        'run',
        'attempt',
        'call',
        'dispatch',
        'response',
      ]) ||
      typeof association.executionId !== 'string' ||
      !strings(association, ['session', 'run', 'call', 'response']) ||
      (association.attempt !== undefined && !isNonNegativeJsonInteger(association.attempt)) ||
      (association.dispatch !== undefined && !isNonNegativeJsonInteger(association.dispatch)) ||
      (association.causedBy !== undefined &&
        sequenceOf(association.causedBy as DiagnosticReference, collectorId) === null))
  )
    return false
  const facts = object(value.facts)
  if (!facts || typeof facts.kind !== 'string') return false
  const decision = ['admission', 'binding', 'planning', 'credential'].includes(String(value.stage))
  const transport = ['queue', 'send', 'content_gate', 'first_content', 'stream_end'].includes(
    String(value.stage),
  )
  const progress = ['reply_handoff', 'settlement', 'retry', 'recovery'].includes(
    String(value.stage),
  )
  const registration = ['registration', 'retirement'].includes(String(value.stage))
  const observer = value.stage === 'observer'
  const diagnostics = ['diagnostics', 'assembly'].includes(String(value.stage))
  if (value.stage === 'planning' && facts.kind === 'measurement') {
    if (!validMeasurementFacts(facts)) return false
  } else if (decision && facts.kind === 'decision') {
    if (
      !only(facts, [
        'kind',
        'cause',
        'adjustment',
        'parameter',
        'credentialScope',
        'credentialPresent',
      ]) ||
      !strings(facts, ['cause', 'adjustment', 'parameter', 'credentialScope']) ||
      !optionalEnum(facts, 'cause', [
        'withdrawn',
        'scope_disallowed',
        'modality_mismatch',
        'credential_unavailable',
        'request_rejected',
        'upstream_unavailable',
        'unrecognized',
        'interrupted_mid_reply',
        'malformed',
        'dependency',
        'closed',
        'concurrent',
      ]) ||
      !optionalEnum(facts, 'adjustment', ['omitted', 'converted', 'clamped']) ||
      !optionalEnum(facts, 'credentialScope', ['tenant', 'factory']) ||
      (facts.credentialPresent !== undefined && typeof facts.credentialPresent !== 'boolean')
    )
      return false
  } else if (transport && facts.kind === 'transport') {
    if (
      !only(facts, [
        'kind',
        'touch',
        'httpStatus',
        'requestedProvider',
        'servingProvider',
        'gate',
        'stream',
      ]) ||
      !strings(facts, ['touch', 'requestedProvider', 'servingProvider', 'gate', 'stream']) ||
      !optionalEnum(facts, 'touch', ['queued', 'touched', 'unknown']) ||
      !optionalEnum(facts, 'gate', ['waiting', 'accepted', 'failed']) ||
      !optionalEnum(facts, 'stream', ['first_content', 'ended', 'lost']) ||
      (facts.httpStatus !== undefined &&
        (typeof facts.httpStatus !== 'number' ||
          !Number.isSafeInteger(facts.httpStatus) ||
          facts.httpStatus < 100 ||
          facts.httpStatus > 599))
    )
      return false
  } else if (progress && facts.kind === 'progress') {
    if (
      !only(facts, [
        'kind',
        'cause',
        'settlement',
        'responseOutcome',
        'anchor',
        'anchorId',
        'retry',
        'owner',
        'policy',
        'submissions',
        'tailConflicts',
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
        'costUsd',
      ]) ||
      !optionalEnum(facts, 'cause', [
        'withdrawn',
        'scope_disallowed',
        'modality_mismatch',
        'credential_unavailable',
        'request_rejected',
        'upstream_unavailable',
        'unrecognized',
        'interrupted_mid_reply',
        'malformed',
        'dependency',
        'closed',
        'concurrent',
      ]) ||
      !optionalEnum(facts, 'settlement', ['unsettled', 'submitted', 'committed', 'unknown']) ||
      !optionalEnum(facts, 'responseOutcome', ['complete', 'failed', 'interrupted']) ||
      !optionalEnum(facts, 'anchor', ['dispatched', 'opened', 'response', 'ended']) ||
      !optionalEnum(facts, 'retry', ['again', 'refused', 'without_resend']) ||
      !strings(facts, [
        'cause',
        'settlement',
        'responseOutcome',
        'anchor',
        'anchorId',
        'retry',
        'owner',
        'policy',
      ]) ||
      ![
        'submissions',
        'tailConflicts',
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
      ].every(key => facts[key] === undefined || isNonNegativeJsonInteger(facts[key])) ||
      (facts.costUsd !== undefined &&
        (!isJsonNumber(facts.costUsd) || jsonNumberSource(facts.costUsd).startsWith('-')))
    )
      return false
  } else if (registration && facts.kind === 'registration') {
    if (
      !only(facts, ['kind', 'phase', 'references', 'executions', 'cancellation']) ||
      !strings(facts, ['phase', 'cancellation']) ||
      !optionalEnum(facts, 'phase', ['published', 'admitted', 'retiring', 'closed']) ||
      !optionalEnum(facts, 'cancellation', [
        'requested',
        'stopped',
        'remaining_active',
        'cleanup_failed',
      ]) ||
      !['references', 'executions'].every(
        key => facts[key] === undefined || isNonNegativeJsonInteger(facts[key]),
      )
    )
      return false
  } else if (observer && facts.kind === 'observer') {
    if (
      !only(facts, [
        'kind',
        'observerStage',
        'reason',
        'position',
        'bufferedEvents',
        'bufferedBytes',
      ]) ||
      !['delivery', 'snapshot', 'increment', 'close'].includes(String(facts.observerStage)) ||
      !['buffer_full', 'consumer_failed', 'scope_mismatch', 'closed'].includes(
        String(facts.reason),
      ) ||
      !['position', 'bufferedEvents', 'bufferedBytes'].every(
        key => facts[key] === undefined || isNonNegativeJsonInteger(facts[key]),
      )
    )
      return false
  } else if (diagnostics && facts.kind === 'diagnostics') {
    if (
      !only(facts, ['kind', 'reason', 'count']) ||
      ![
        'sink_failed',
        'sink_contract_violation',
        'queue_full',
        'io_failed',
        'retention_full',
        'transport_retention_full',
        'close_incomplete',
        'export_failed',
      ].includes(String(facts.reason)) ||
      (facts.count !== undefined && !isNonNegativeJsonInteger(facts.count))
    )
      return false
  } else return false
  return true
}
