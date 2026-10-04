import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { DiagnosticRecord, DiagnosticScope } from '@omne-harness-lite/model-request-runtime'
import { createDiagnosticJournal, openDiagnosticJournalReader } from '../src/diagnostic-journal.ts'
import type { DiagnosticJournalConfig } from '../src/diagnostic-journal.ts'

const scope: DiagnosticScope = {
  kind: 'tenant',
  tenant: unwrap(parseTenantId({ organization: 'tenant-org', account: 'tenant-a' })),
}
const wrongScope: DiagnosticScope = {
  kind: 'tenant',
  tenant: unwrap(parseTenantId({ organization: 'tenant-org', account: 'tenant-b' })),
}
const workspaceTmp = resolve(process.cwd(), '../../tmp')
let temporary: string
let rootDir: string

beforeEach(async () => {
  await fs.mkdir(workspaceTmp, { recursive: true })
  temporary = await fs.mkdtemp(join(workspaceTmp, 'diagnostic-journal-'))
  rootDir = join(temporary, 'private')
})
afterEach(async () => {
  await fs.rm(temporary, { recursive: true, force: true })
})

function config(overrides: Partial<DiagnosticJournalConfig> = {}): DiagnosticJournalConfig {
  return {
    rootDir,
    collectorId: 'collector-a',
    scope,
    maxRecordBytes: 1024,
    segmentMaxBytes: 1024,
    retainedMaxBytes: 2048,
    retainedMaxSegments: 2,
    retentionMs: 60_000,
    queryMaxRecords: 4,
    queryMaxBytes: 1024,
    queryScanMaxBytes: 1024,
    queryConcurrency: 1,
    queryMaxDurationMs: 100,
    exportMaxRecords: 4,
    exportMaxBytes: 1024,
    wallClock: () => new Date('2026-09-28T00:00:30Z'),
    monotonicClock: () => 30_000,
    schedule(ms, callback) {
      const timer = setTimeout(callback, ms)
      return { cancel: () => clearTimeout(timer) }
    },
    ...overrides,
  }
}

function record(sequence: number): DiagnosticRecord {
  return {
    format: 'model-diagnostics/1',
    collectorId: 'collector-a',
    sequence: String(sequence),
    scope,
    source: 'transport',
    stage: 'send',
    outcome: 'completed',
    facts: { kind: 'transport', httpStatus: 503 },
    observedAt: '2026-09-28T00:00:25.000Z',
  }
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>(resolve => {
    release = resolve
  })
  return { promise, release }
}

describe('example diagnostic JSONL journal', () => {
  it('creates owner-private files, queries and exports exact closed records after read-only reopen', async () => {
    const journal = await createDiagnosticJournal(config())
    expect(await journal.query({ scope, limit: 2, maxBytes: 1024 })).toEqual({
      page: {
        records: [],
        through: { collectorId: 'collector-a', sequence: '0' },
        coverage: 'complete',
      },
    })
    expect(await journal.append(record(1))).toBe('written')
    expect(
      await journal.query({
        scope,
        limit: 2,
        maxBytes: 1024,
        through: { collectorId: 'collector-a', sequence: '0' },
      }),
    ).toEqual({
      page: {
        records: [],
        through: { collectorId: 'collector-a', sequence: '0' },
        coverage: 'complete',
      },
    })
    await journal.flush()
    expect(await journal.close()).toEqual({ complete: true, coverage: 'complete' })
    const privateStat = await fs.stat(rootDir)
    const instanceStat = await fs.stat(join(rootDir, 'collector-a'))
    const names = await fs.readdir(join(rootDir, 'collector-a'))
    expect(privateStat.mode & 0o777).toBe(0o700)
    expect(instanceStat.mode & 0o777).toBe(0o700)
    expect((await fs.stat(join(rootDir, 'collector-a', names[0]!))).mode & 0o777).toBe(0o600)

    const reopened = await openDiagnosticJournalReader(config())
    const page = await reopened.query({ scope, limit: 2, maxBytes: 1024 })
    expect(page).toMatchObject({
      page: {
        records: [record(1)],
        through: {
          collectorId: 'collector-a',
          sequence: '1',
        },
      },
    })
    const exported = await reopened.exportPage(
      { scope, limit: 2, maxBytes: 1024 },
      { maxRecords: 2, maxBytes: 1024 },
    )
    expect(exported).toHaveProperty('page.jsonl')
    if ('page' in exported) expect(exported.page.jsonl).toContain('"httpStatus":503')
    expect(await reopened.close()).toHaveProperty('complete', true)
  })

  it('retains exact large associations and decimal cost in JSONL and exported pages', async () => {
    const journal = await createDiagnosticJournal(config())
    const large = new LosslessNumber('9007199254740993')
    const exact: DiagnosticRecord = {
      format: 'model-diagnostics/1',
      collectorId: 'collector-a',
      sequence: '1',
      scope,
      source: 'runtime',
      stage: 'settlement',
      outcome: 'completed',
      association: { executionId: 'e1', dispatch: large },
      facts: {
        kind: 'progress',
        settlement: 'committed',
        inputTokens: large,
        costUsd: new LosslessNumber('0.000000000000000001'),
      },
      observedAt: '2026-09-28T00:00:25.000Z',
    }
    await journal.append(exact)
    await journal.close()
    const reopened = await openDiagnosticJournalReader(config())
    const result = await reopened.exportPage(
      { scope, limit: 1, maxBytes: 1024 },
      { maxRecords: 1, maxBytes: 1024 },
    )
    expect(result).toHaveProperty('page.jsonl')
    if ('page' in result) {
      expect(result.page.jsonl).toContain('"dispatch":9007199254740993')
      expect(result.page.jsonl).toContain('"inputTokens":9007199254740993')
      expect(result.page.jsonl).toContain('"costUsd":0.000000000000000001')
    }
    await reopened.close()
  })

  it('rejects an unlisted raw field before file append and keeps the writer usable', async () => {
    const journal = await createDiagnosticJournal(config())
    const forbidden = Object.assign({}, record(1), { raw: 'private upstream echo' })
    await expect(journal.append(forbidden)).rejects.toThrow('invalid')
    expect(await journal.append(record(1))).toBe('written')
    const result = await journal.exportPage(
      { scope, limit: 1, maxBytes: 1024 },
      { maxRecords: 1, maxBytes: 1024 },
    )
    if ('page' in result) expect(result.page.jsonl).not.toContain('private upstream echo')
    await journal.close()
  })

  it('rejects mismatched scope and collector before opening a read file', async () => {
    let opens = 0
    const journal = await createDiagnosticJournal(
      config({
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            if (flags === (constants.O_RDONLY | constants.O_NOFOLLOW)) opens++
            return fs.open(path, flags, mode)
          },
        },
      }),
    )
    await journal.append(record(1))
    expect(await journal.query({ scope: wrongScope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'forbidden',
    })
    expect(
      await journal.exportPage(
        { scope, after: { collectorId: 'other', sequence: '1' }, limit: 1, maxBytes: 1024 },
        { maxRecords: 1, maxBytes: 1024 },
      ),
    ).toEqual({ rejected: 'invalidInput' })
    expect(opens).toBe(0)
    await journal.close()
  })

  it('copies the configured TenantId and rejects a mutated caller object', async () => {
    if (scope.kind !== 'tenant' || wrongScope.kind !== 'tenant') throw new Error('fixture')
    const supplied: DiagnosticScope = { kind: 'tenant', tenant: { ...scope.tenant } }
    const journal = await createDiagnosticJournal(config({ scope: supplied }))
    Reflect.set(supplied.tenant, 'account', wrongScope.tenant.account)
    await journal.append(record(1))
    expect(await journal.query({ scope: supplied, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'forbidden',
    })
    expect(
      await journal.query({
        scope: { kind: 'tenant', tenant: { ...scope.tenant } },
        limit: 1,
        maxBytes: 1024,
      }),
    ).toHaveProperty('page.records.0.sequence', '1')
    await journal.close()
  })

  it('keeps a late open owned after timeout and denies a second query without more I/O', async () => {
    const gate = deferred()
    let opens = 0
    const journal = await createDiagnosticJournal(
      config({
        queryMaxDurationMs: 10,
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            if (flags === (constants.O_RDONLY | constants.O_NOFOLLOW)) {
              opens++
              await gate.promise
            }
            return fs.open(path, flags, mode)
          },
        },
      }),
    )
    await journal.append(record(1))
    expect(await journal.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'timeout',
    })
    expect(journal.health()).toMatchObject({
      pendingQueries: 1,
      pendingQueryIo: 1,
      timedOutQueries: 1,
    })
    expect(
      await journal.exportPage(
        { scope, limit: 1, maxBytes: 1024 },
        { maxRecords: 1, maxBytes: 1024 },
      ),
    ).toEqual({ rejected: 'busy' })
    expect(opens).toBe(1)
    gate.release()
    for (let index = 0; index < 20 && journal.health().pendingQueries === 1; index++)
      await new Promise(resolve => setTimeout(resolve, 5))
    expect(journal.health()).toMatchObject({
      pendingQueries: 0,
      pendingQueryIo: 0,
      openQueryHandles: 0,
    })
    expect(await journal.close()).toHaveProperty('complete', true)
  })

  it('holds the shared query permit through a late file close and closes before completing journal close', async () => {
    const gate = deferred()
    const journal = await createDiagnosticJournal(
      config({
        queryMaxDurationMs: 10,
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            const handle = await fs.open(path, flags, mode)
            if (flags !== (constants.O_RDONLY | constants.O_NOFOLLOW)) return handle
            return new Proxy(handle, {
              get(target, key) {
                if (key === 'close')
                  return async () => {
                    await gate.promise
                    return target.close()
                  }
                const value: unknown = Reflect.get(target, key, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          },
        },
      }),
    )
    await journal.append(record(1))
    expect(await journal.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'timeout',
    })
    expect(journal.health()).toMatchObject({
      pendingQueries: 1,
      pendingQueryIo: 1,
      pendingQueryCloses: 1,
      openQueryHandles: 1,
    })
    expect(await journal.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({ rejected: 'busy' })
    const closing = journal.close()
    gate.release()
    expect(await closing).toHaveProperty('complete', true)
    expect(journal.health()).toMatchObject({
      pendingQueries: 0,
      pendingQueryIo: 0,
      pendingQueryCloses: 0,
      openQueryHandles: 0,
    })
  })

  it('retains an unknown close resource and returns incomplete without releasing its permit', async () => {
    const journal = await createDiagnosticJournal(
      config({
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            const handle = await fs.open(path, flags, mode)
            if (flags !== (constants.O_RDONLY | constants.O_NOFOLLOW)) return handle
            return new Proxy(handle, {
              get(target, key) {
                if (key === 'close')
                  return async () => {
                    await target.close()
                    throw new Error('unknown close')
                  }
                const value: unknown = Reflect.get(target, key, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          },
        },
      }),
    )
    await journal.append(record(1))
    expect(await journal.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'unavailable',
    })
    expect(journal.health()).toMatchObject({
      pendingQueries: 1,
      openQueryHandles: 1,
      queryCloseFailures: 1,
      coverage: 'degraded',
    })
    expect(await journal.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({ rejected: 'busy' })
    expect(await journal.close()).toMatchObject({
      incomplete: {
        pendingQueries: 1,
        openQueryHandles: 1,
        queryCloseFailures: 1,
        resourcesOpen: true,
      },
    })
  })

  it('does not evict bytes held by a timed-out reader while appending at capacity', async () => {
    const gate = deferred()
    const journal = await createDiagnosticJournal(
      config({
        maxRecordBytes: 450,
        segmentMaxBytes: 450,
        retainedMaxBytes: 450,
        retainedMaxSegments: 1,
        queryMaxBytes: 450,
        queryScanMaxBytes: 450,
        exportMaxBytes: 450,
        queryMaxDurationMs: 10,
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            const handle = await fs.open(path, flags, mode)
            if (flags !== (constants.O_RDONLY | constants.O_NOFOLLOW)) return handle
            return new Proxy(handle, {
              get(target, key) {
                if (key === 'close')
                  return async () => {
                    await gate.promise
                    return target.close()
                  }
                const value: unknown = Reflect.get(target, key, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          },
        },
      }),
    )
    expect(await journal.append(record(1))).toBe('written')
    expect(await journal.query({ scope, limit: 1, maxBytes: 450 })).toEqual({ rejected: 'timeout' })
    expect(journal.health().openQueryHandles).toBe(1)
    expect(journal.health().retainedBytes).toEqual(expect.any(Number))
    expect(await journal.append(record(2))).toBe('retention_full')
    gate.release()
    for (let index = 0; index < 20 && journal.health().pendingQueries === 1; index++)
      await new Promise(resolve => setTimeout(resolve, 5))
    expect(await journal.append(record(2))).toBe('written')
    expect(journal.health()).toMatchObject({ retainedSegments: 1, evicted: 1 })
    await journal.close()
  })

  it('rolls segments under the configured one-segment budget and reports an expired cursor', async () => {
    const journal = await createDiagnosticJournal(
      config({
        maxRecordBytes: 450,
        segmentMaxBytes: 450,
        retainedMaxBytes: 450,
        retainedMaxSegments: 1,
        queryMaxBytes: 450,
        queryScanMaxBytes: 450,
        exportMaxBytes: 450,
      }),
    )
    expect(await journal.append(record(1))).toBe('written')
    const firstBytes = journal.health().retainedBytes
    expect(await journal.append(record(2))).toBe('written')
    expect(await journal.append(record(3))).toBe('written')
    expect(journal.health()).toMatchObject({
      evicted: 2,
      evictedBytes: Number(firstBytes) * 2,
      retainedRecords: 1,
      retainedSegments: 1,
    })
    expect(
      await journal.query({
        scope,
        after: { collectorId: 'collector-a', sequence: '1' },
        limit: 1,
        maxBytes: 450,
      }),
    ).toEqual({
      rejected: 'cursor_expired',
      earliest: { collectorId: 'collector-a', sequence: '3' },
      coverage: 'degraded',
    })
    await journal.close()
  })

  it('does not count deleted bytes when eviction unlink fails', async () => {
    const journal = await createDiagnosticJournal(
      config({
        maxRecordBytes: 450,
        segmentMaxBytes: 450,
        retainedMaxBytes: 450,
        retainedMaxSegments: 1,
        queryMaxBytes: 450,
        queryScanMaxBytes: 450,
        exportMaxBytes: 450,
        fs: {
          ...fs,
          unlink: async () => {
            throw new Error('unlink failed')
          },
        },
      }),
    )
    await journal.append(record(1))
    const before = journal.health().retainedBytes
    expect(await journal.append(record(2))).toBe('retention_full')
    expect(journal.health()).toMatchObject({
      retainedBytes: before,
      retainedRecords: 1,
      evicted: 0,
      evictedBytes: 0,
      coverage: 'degraded',
    })
    await journal.close()
  })

  it('expires the active segment when monotonic retention elapses before the next append', async () => {
    let now = 0
    const journal = await createDiagnosticJournal(
      config({ retentionMs: 20_000, monotonicClock: () => now }),
    )
    await journal.append(record(1))
    const firstBytes = journal.health().retainedBytes
    now = 30_000
    await journal.append(record(2))
    expect(journal.health()).toMatchObject({
      expired: 1,
      expiredBytes: firstBytes,
      retainedRecords: 1,
      retainedSegments: 1,
      oldestAvailableSequence: '2',
      coverage: 'degraded',
    })
    await journal.close()
  })

  it('advances an empty page when the bounded scan finds only expired lines', async () => {
    const journal = await createDiagnosticJournal(
      config({
        maxRecordBytes: 450,
        segmentMaxBytes: 900,
        retainedMaxBytes: 1800,
        retentionMs: 10_000,
        queryScanMaxBytes: 450,
        queryMaxBytes: 450,
        exportMaxBytes: 450,
      }),
    )
    await journal.append({ ...record(1), observedAt: '2026-09-28T00:00:00.000Z' })
    await journal.append(record(2))
    const first = await journal.query({ scope, limit: 2, maxBytes: 450 })
    expect(first).toEqual({
      page: {
        records: [],
        through: {
          collectorId: 'collector-a',
          sequence: '2',
        },
        next: {
          collectorId: 'collector-a',
          sequence: '1',
        },
        coverage: 'degraded',
      },
    })
    const next = await journal.query({
      scope,
      after: { collectorId: 'collector-a', sequence: '1' },
      through: { collectorId: 'collector-a', sequence: '2' },
      limit: 2,
      maxBytes: 450,
    })
    expect(next).toMatchObject({ page: { records: [record(2)] } })
    await journal.close()
  })

  it('rejects broad permissions and a symbolic private root before creating an instance', async () => {
    await fs.mkdir(rootDir, { mode: 0o700 })
    await fs.chmod(rootDir, 0o755)
    await expect(createDiagnosticJournal(config())).rejects.toThrow('permissions')
    await fs.rm(rootDir, { recursive: true })
    const target = join(temporary, 'target')
    await fs.mkdir(target, { mode: 0o700 })
    await fs.symlink(target, rootDir)
    await expect(createDiagnosticJournal(config())).rejects.toThrow('permissions')
  })

  it('does not advance a written line after a real filesystem write failure', async () => {
    const journal = await createDiagnosticJournal(
      config({
        fs: {
          ...fs,
          open: async (path, flags, mode) => {
            const handle = await fs.open(path, flags, mode)
            if (
              flags !==
              (constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW)
            )
              return handle
            return new Proxy(handle, {
              get(target, key) {
                if (key === 'write')
                  return async () => {
                    throw new Error('write failed')
                  }
                const value: unknown = Reflect.get(target, key, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          },
        },
      }),
    )
    await expect(journal.append(record(1))).rejects.toThrow()
    expect(journal.health()).toMatchObject({ retainedBytes: 'unknown', coverage: 'unknown' })
    await expect(journal.flush()).rejects.toThrow()
    expect(await journal.close()).toMatchObject({ incomplete: { flushFailed: true } })
  })

  it('rejects a partial persisted line as corruption on read-only reopen', async () => {
    const journal = await createDiagnosticJournal(config())
    await journal.append(record(1))
    await journal.close()
    const dir = join(rootDir, 'collector-a')
    const [name] = await fs.readdir(dir)
    await fs.appendFile(join(dir, name!), '{"partial":')
    const reopened = await openDiagnosticJournalReader(config())
    expect(await reopened.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'corrupt',
    })
    expect(await reopened.close()).toHaveProperty('complete', true)
  })

  it('reports a full but unlisted stored field as corrupt rather than exporting it', async () => {
    const journal = await createDiagnosticJournal(config())
    await journal.append(record(1))
    await journal.close()
    const dir = join(rootDir, 'collector-a')
    const [name] = await fs.readdir(dir)
    const path = join(dir, name!)
    const text = await fs.readFile(path, 'utf8')
    await fs.writeFile(
      path,
      text.replace('"httpStatus":503', '"httpStatus":503,"raw":"private upstream echo"'),
    )
    const reopened = await openDiagnosticJournalReader(config())
    expect(await reopened.query({ scope, limit: 1, maxBytes: 1024 })).toEqual({
      rejected: 'corrupt',
    })
    await reopened.close()
  })
})
