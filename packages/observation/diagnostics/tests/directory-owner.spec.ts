import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalDiagnosticsDirectory } from '../dist/index.js'
import type {
  DiagnosticIdentity,
  LocalDiagnosticSourceOptions,
  LocalDiagnosticsDirectory,
} from '../dist/index.js'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-diagnostics/directory-tests')
const lockChild = resolve(import.meta.dirname, 'fixtures/directory-lock-child.mjs')
const shortWriteChild = resolve(import.meta.dirname, 'fixtures/short-write-unknown-child.mjs')
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
const nodeFsPromises = createRequire(import.meta.url)(
  'node:fs/promises',
) as typeof import('node:fs/promises')
type FlexibleCall = (...args: unknown[]) => unknown
const owners = new Set<LocalDiagnosticsDirectory>()

beforeAll(async () => {
  await mkdir(scratchRoot, { recursive: true })
})

afterEach(async () => {
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  await Promise.all([...owners].map(owner => owner.close({ deadlineMs: 1_000 })))
  owners.clear()
})

function source(
  sourceId: string,
  overrides: Partial<LocalDiagnosticSourceOptions> = {},
): LocalDiagnosticSourceOptions {
  return {
    instanceId: 'directory-owner-instance',
    sourceId,
    level: 'debug',
    maxRecordBytes: 1_024,
    maxActiveSpans: 8,
    maxBufferBytes: 2_048,
    maxFileBytes: 8 * 1_024,
    ...overrides,
  }
}

function identity(): DiagnosticIdentity {
  return {
    tenantId: 'tenant-directory',
    principal: { kind: 'user', user: { userId: 'user-directory' } },
    causality: {},
  }
}

async function owner(
  directory: string,
  overrides: Readonly<{ maxDirectoryBytes?: number; maxFiles?: number }> = {},
): Promise<LocalDiagnosticsDirectory> {
  const result = await createLocalDiagnosticsDirectory({
    directory,
    maxDirectoryBytes: overrides.maxDirectoryBytes ?? 64 * 1_024,
    maxFiles: overrides.maxFiles ?? 4,
  })
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`owner unavailable: ${result.code}`)
  owners.add(result.owner)
  return result.owner
}

describe('D1-R1 directory ownership and resource identity', () => {
  it('exposes only the directory-owned local creation entry', async () => {
    const entry = await import('../dist/index.js')
    expect(entry.createLocalDiagnosticsDirectory).toBeTypeOf('function')
    expect('createLocalDiagnostics' in entry).toBe(false)
  })

  it('rejects invalid directory configuration before allocating a path or lock file', async () => {
    const parent = await mkdtemp(join(scratchRoot, 'invalid-directory-'))
    const directory = join(parent, 'not-created')
    const result = await createLocalDiagnosticsDirectory({
      directory,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 0,
    })
    expect(result).toEqual({ status: 'invalid', code: 'INVALID_MAX_FILES' })
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses one stable lock inode across path aliases, close, and restart', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'alias-'))
    const alias = join(dirname(directory), '.', basename(directory))
    const first = await owner(directory)
    const before = await lstat(join(directory, '.diagnostics.lock'), { bigint: true })

    const blocked = await createLocalDiagnosticsDirectory({
      directory: alias,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(blocked).toEqual({ status: 'unavailable', code: 'DIRECTORY_BUSY', cleanup: null })
    const during = await lstat(join(directory, '.diagnostics.lock'), { bigint: true })
    expect({ dev: during.dev, ino: during.ino, size: during.size }).toEqual({
      dev: before.dev,
      ino: before.ino,
      size: 0n,
    })

    const created = await first.create(source('alias-source'))
    expect(created.status).toBe('created')
    const closed = await first.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({
      status: 'closed',
      state: { phase: 'closed', lock: 'released', resource: 'released' },
    })
    owners.delete(first)

    const restarted = await owner(alias)
    expect(restarted.inspect()).toMatchObject({
      phase: 'active',
      scan: 'complete',
      materializedFiles: 1,
      reservedFiles: 0,
    })
    const after = await lstat(join(directory, '.diagnostics.lock'), { bigint: true })
    expect({ dev: after.dev, ino: after.ino, size: after.size }).toEqual({
      dev: before.dev,
      ino: before.ino,
      size: 0n,
    })
  })

  it('excludes a second process until the first process closes the real flock', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'process-'))
    const child = fork(lockChild, [directory], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    try {
      const [ready] = (await once(child, 'message')) as [Record<string, unknown>]
      expect(ready.status).toBe('created')
      const blocked = await createLocalDiagnosticsDirectory({
        directory,
        maxDirectoryBytes: 64 * 1_024,
        maxFiles: 4,
      })
      expect(blocked).toEqual({ status: 'unavailable', code: 'DIRECTORY_BUSY', cleanup: null })
      child.send('close')
      const [finished] = (await once(child, 'message')) as [Record<string, unknown>]
      expect(finished).toMatchObject({ status: 'finished', closed: { status: 'closed' } })
      await once(child, 'exit')
      await owner(directory)
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  })

  it('reserves one shared source slot before the intercepted open and joins identical creates', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'join-'))
    const subject = await owner(directory, { maxFiles: 1 })
    const originalOpen = nodeFs.open as unknown as FlexibleCall
    let pendingOpen: unknown[] | undefined
    let openCount = 0
    const intercepted = new Promise<void>(resolveIntercepted => {
      vi.spyOn(nodeFs, 'open').mockImplementation(((...args: unknown[]) => {
        openCount += 1
        pendingOpen = args
        resolveIntercepted()
        return undefined
      }) as typeof nodeFs.open)
    })
    syncBuiltinESMExports()

    const first = subject.create(source('joined-source'))
    await intercepted
    const joined = subject.create(source('joined-source'))
    const rejected = await subject.create(source('other-source'))
    expect(subject.inspect()).toMatchObject({ materializedFiles: 0, reservedFiles: 1 })
    expect(rejected).toEqual({ status: 'unavailable', code: 'RETENTION_CAPACITY' })
    expect(openCount).toBe(1)
    if (pendingOpen !== undefined) originalOpen(...pendingOpen)
    const [firstResult, joinedResult] = await Promise.all([first, joined])
    expect(firstResult.status).toBe('created')
    expect(joinedResult.status).toBe('created')
    if (firstResult.status === 'created' && joinedResult.status === 'created') {
      expect(joinedResult.runtime).toBe(firstResult.runtime)
    }
  })

  it('releases a source slot after an open failure that created no file and allows a retry', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'open-retry-'))
    const subject = await owner(directory, { maxFiles: 1 })
    const originalOpen = nodeFs.open as unknown as FlexibleCall
    let failed = false
    vi.spyOn(nodeFs, 'open').mockImplementation(((...args: unknown[]) => {
      if (failed) return originalOpen(...args)
      failed = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected open signature')
      process.nextTick(() => callback(Object.assign(new Error('OPEN_SECRET'), { code: 'EACCES' })))
      return undefined
    }) as typeof nodeFs.open)
    syncBuiltinESMExports()
    await expect(subject.create(source('retry-source'))).resolves.toEqual({
      status: 'unavailable',
      code: 'SOURCE_OPEN_EACCES',
    })
    expect(subject.inspect()).toMatchObject({ materializedFiles: 0, reservedFiles: 0 })
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    const retried = await subject.create(source('retry-source'))
    expect(retried.status).toBe('created')
  })

  it('keeps a materialized slot after configuration failure until the degraded source closes', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'prepare-'))
    const subject = await owner(directory, { maxFiles: 1 })
    const originalFchmod = nodeFs.fchmod as unknown as FlexibleCall
    vi.spyOn(nodeFs, 'fchmod').mockImplementation(((...args: unknown[]) => {
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fchmod signature')
      process.nextTick(() => callback(Object.assign(new Error('PREP_SECRET'), { code: 'EIO' })))
      return undefined
    }) as typeof nodeFs.fchmod)
    syncBuiltinESMExports()
    const failed = await subject.create(source('failed-source'))
    vi.mocked(nodeFs.fchmod).mockImplementation(originalFchmod as typeof nodeFs.fchmod)
    syncBuiltinESMExports()
    expect(failed.status).toBe('created')
    if (failed.status !== 'created') return
    expect(failed.runtime.inspect()).toMatchObject({
      phase: 'degraded',
      resource: 'released',
      lastErrorCode: 'SOURCE_OPEN_EIO',
    })
    expect(subject.inspect()).toMatchObject({ materializedFiles: 1, reservedFiles: 0 })
    await expect(subject.create(source('blocked-source'))).resolves.toEqual({
      status: 'unavailable',
      code: 'RETENTION_CAPACITY',
    })
    await expect(failed.runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({
      status: 'closed',
    })
    expect(subject.inspect()).toMatchObject({ materializedFiles: 1, reservedFiles: 0 })
  })

  it('keeps the lock while a source open is late and releases it only after retrying owner close', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'late-open-'))
    const subject = await owner(directory)
    const originalOpen = nodeFs.open as unknown as FlexibleCall
    let pendingOpen: unknown[] | undefined
    const intercepted = new Promise<void>(resolveIntercepted => {
      vi.spyOn(nodeFs, 'open').mockImplementation(((...args: unknown[]) => {
        pendingOpen = args
        resolveIntercepted()
        return undefined
      }) as typeof nodeFs.open)
    })
    syncBuiltinESMExports()
    const creating = subject.create(source('late-source'))
    await intercepted
    const blockedClose = await subject.close({ deadlineMs: 10 })
    expect(blockedClose).toMatchObject({
      status: 'blocked',
      state: { phase: 'closing', lock: 'held', reservedFiles: 1 },
    })
    await expect(subject.create(source('after-close-start'))).resolves.toEqual({
      status: 'unavailable',
      code: 'DIRECTORY_CLOSING',
    })
    const contender = await createLocalDiagnosticsDirectory({
      directory,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(contender).toEqual({ status: 'unavailable', code: 'DIRECTORY_BUSY', cleanup: null })
    if (pendingOpen !== undefined) originalOpen(...pendingOpen)
    expect((await creating).status).toBe('created')
    const closed = await subject.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({ status: 'closed', state: { lock: 'released' } })
    owners.delete(subject)
    await owner(directory)
  })

  it('retries final stat without releasing uncertain reserved bytes or the directory lock', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'final-stat-'))
    const subject = await owner(directory)
    const created = await subject.create(source('stat-source'))
    expect(created.status).toBe('created')
    if (created.status !== 'created') return
    const context = created.runtime.diagnostics.scope(identity())
    created.runtime.diagnostics.log(context, {
      component: 'diagnostics.directory',
      phase: 'stat',
      code: 'directory.stat_pending',
      level: 'info',
    })
    const sourcePath = join(
      directory,
      (await readdir(directory)).find(file => file.startsWith('diagnostic-'))!,
    )
    const originalLstat = nodeFsPromises.lstat
    let failed = false
    vi.spyOn(nodeFsPromises, 'lstat').mockImplementation(async (...args) => {
      if (!failed && String(args[0]) === sourcePath) {
        failed = true
        throw Object.assign(new Error('STAT_SECRET'), { code: 'EIO' })
      }
      return originalLstat(...args)
    })
    syncBuiltinESMExports()
    const blocked = await created.runtime.close({ deadlineMs: 1_000 })
    expect(blocked).toMatchObject({
      status: 'blocked',
      state: { phase: 'closing', resource: 'released', lastErrorCode: 'SOURCE_FINAL_STAT_FAILED' },
    })
    expect(subject.inspect()).toMatchObject({ lock: 'held', scan: 'complete' })
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    const closed = await created.runtime.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({ status: 'closed', state: { resource: 'released' } })
    expect(BigInt(subject.inspect().chargedBytes ?? '0')).toBe(
      BigInt((await stat(sourcePath)).size),
    )
    expect(subject.inspect().reservedBytes).toBe('0')
  })

  it('keeps a short write failure reserved until process exit when source release is not proved', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'short-write-'))
    const child = fork(shortWriteChild, [directory], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    const exited = once(child, 'exit')
    const [message] = (await once(child, 'message')) as [
      Readonly<{
        shortWrite: boolean
        actualBytes: number
        before: Readonly<{ chargedBytes: string | null; reservedBytes: string }>
        close: Readonly<{ status: string }>
        after: Readonly<{ chargedBytes: string | null; reservedBytes: string; lock: string }>
      }>,
    ]
    expect(message.shortWrite).toBe(true)
    expect(message.close.status).toBe('blocked')
    expect(BigInt(message.before.reservedBytes)).toBeGreaterThan(0n)
    expect(BigInt(message.after.reservedBytes)).toBeGreaterThan(0n)
    expect(BigInt(message.after.chargedBytes ?? '0')).toBeGreaterThanOrEqual(
      BigInt(message.actualBytes),
    )
    expect(BigInt(message.after.chargedBytes ?? '0')).toBeLessThanOrEqual(4n * 1_024n)
    expect(message.after.lock).toBe('held')
    await exited
    await owner(directory)
  })

  it('holds the flock across an unfinished span and closes after the span ends', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'active-span-'))
    const subject = await owner(directory)
    const created = await subject.create(source('span-source'))
    expect(created.status).toBe('created')
    if (created.status !== 'created') return
    const context = created.runtime.diagnostics.scope(identity())
    const span = created.runtime.diagnostics.startSpan(context, {
      component: 'diagnostics.directory',
      phase: 'close',
      code: 'directory.active_span',
      level: 'info',
    })
    const blocked = await subject.close({ deadlineMs: 10 })
    expect(blocked).toMatchObject({ status: 'blocked', state: { lock: 'held' } })
    const contender = await createLocalDiagnosticsDirectory({
      directory,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(contender).toEqual({ status: 'unavailable', code: 'DIRECTORY_BUSY', cleanup: null })
    span.end({ code: 'directory.active_span_done', outcome: 'ok' })
    const closed = await subject.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({ status: 'closed', state: { lock: 'released' } })
    owners.delete(subject)
    await owner(directory)
  })

  it('preserves a nonzero or symlink lock file without opening an owner', async () => {
    const nonzero = await mkdtemp(join(scratchRoot, 'nonzero-lock-'))
    await writeFile(join(nonzero, '.diagnostics.lock'), 'do-not-truncate', { mode: 0o600 })
    const rejected = await createLocalDiagnosticsDirectory({
      directory: nonzero,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(rejected).toMatchObject({ status: 'unavailable', code: 'INVALID_LOCK_FILE' })
    expect(await readFile(join(nonzero, '.diagnostics.lock'), 'utf8')).toBe('do-not-truncate')

    const linked = await mkdtemp(join(scratchRoot, 'linked-lock-'))
    const target = join(linked, 'target')
    await writeFile(target, '')
    await symlink(target, join(linked, '.diagnostics.lock'))
    const linkedResult = await createLocalDiagnosticsDirectory({
      directory: linked,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(linkedResult).toMatchObject({ status: 'unavailable', code: 'INVALID_LOCK_FILE' })
    expect((await lstat(join(linked, '.diagnostics.lock'))).isSymbolicLink()).toBe(true)
  })

  it('returns cleanup when a lock loser close is unknown without disturbing the winner', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'loser-close-'))
    const winner = await owner(directory)
    const lockPath = join(directory, '.diagnostics.lock')
    const originalOpen = nodeFsPromises.open
    let loserCloseCalls = 0
    vi.spyOn(nodeFsPromises, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args)
      if (String(args[0]) === lockPath) {
        const originalClose = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          loserCloseCalls += 1
          await originalClose()
          throw Object.assign(new Error('LOSER_CLOSE_SECRET'), { code: 'EIO' })
        })
      }
      return handle
    })
    syncBuiltinESMExports()
    const loser = await createLocalDiagnosticsDirectory({
      directory,
      maxDirectoryBytes: 64 * 1_024,
      maxFiles: 4,
    })
    expect(loser.status).toBe('unavailable')
    if (loser.status !== 'unavailable' || loser.cleanup === null) return
    expect(loser).toMatchObject({ status: 'unavailable', code: 'DIRECTORY_BUSY' })
    expect(loser.cleanup.inspect()).toMatchObject({
      phase: 'closing',
      lock: 'released',
      resource: 'unknown',
      lastErrorCode: 'EIO',
    })
    await expect(loser.cleanup.close({ deadlineMs: 100 })).resolves.toMatchObject({
      status: 'blocked',
    })
    expect(loserCloseCalls).toBe(1)
    const created = await winner.create(source('winner-still-live'))
    expect(created.status).toBe('created')
  })

  it('reports lock release unknown separately while a successor follows the actual flock result', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'lock-unknown-'))
    const lockPath = join(directory, '.diagnostics.lock')
    const originalOpen = nodeFsPromises.open
    let injected = false
    vi.spyOn(nodeFsPromises, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args)
      if (String(args[0]) === lockPath && !injected) {
        const originalClose = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementationOnce(async () => {
          await originalClose()
          throw Object.assign(new Error('LOCK_CLOSE_SECRET'), { code: 'EIO' })
        })
        injected = true
      }
      return handle
    })
    syncBuiltinESMExports()
    const subject = await owner(directory)
    const unknown = await subject.close({ deadlineMs: 1_000 })
    expect(unknown).toMatchObject({
      status: 'blocked',
      state: { phase: 'closing', lock: 'unknown', resource: 'unknown', lastErrorCode: 'EIO' },
    })
    expect(await subject.close({ deadlineMs: 1_000 })).toMatchObject({
      status: 'blocked',
      state: { lock: 'unknown' },
    })
    owners.delete(subject)
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    await owner(directory)
  })
})
