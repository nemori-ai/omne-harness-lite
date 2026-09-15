import { appendFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { DiagnosticContext, Diagnostics } from '@omne-harness-lite/diagnostics'
import type {
  JsonlProviderOptions,
  OperationInput,
  PreparedCommit,
  RecordWriter,
} from '@omne-harness-lite/records'
import type { OperationRef } from '@omne-harness-lite/work-data'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fault = vi.hoisted(() => ({
  journal: '',
  armed: false,
  mode: 'none' as 'none' | 'write-before' | 'partial-write' | 'short-write' | 'sync' | 'sync-after',
  writes: 0,
  failed: false,
  lockClose: false,
  lockCloseSentinel: false,
  lockCloseSentinelFailed: false,
  forceClose: null as null | (() => Promise<void>),
  journalClose: false,
  forceJournalClose: null as null | (() => Promise<void>),
  forceHeldJournalClose: null as null | (() => Promise<void>),
  forceHeldLockClose: null as null | (() => Promise<void>),
  evidenceClose: false,
  forceEvidenceClose: null as null | (() => Promise<void>),
  directory: '',
  directorySyncs: 0,
  directoryFailAt: 0,
  directoryAfter: false,
}))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  type BufferWrite = (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ) => Promise<Readonly<{ bytesWritten: number; buffer: Uint8Array }>>
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (typeof args[0] === 'string' && args[0].endsWith('/.writer.lock')) {
        const close = handle.close.bind(handle)
        fault.forceHeldLockClose = close
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          if (fault.lockCloseSentinel) {
            if (!fault.lockCloseSentinelFailed) {
              fault.lockCloseSentinelFailed = true
              fault.forceClose = close
              throw new Error('injected lock close failure after wrapper invalidation')
            }
            return
          }
          if (fault.lockClose) {
            fault.forceClose = close
            throw new Error('injected lock close uncertainty')
          }
          return close()
        })
      }
      if (args[0] === fault.directory && args[1] === 'r') {
        const syncDirectory = handle.sync.bind(handle)
        vi.spyOn(handle, 'sync').mockImplementation(async () => {
          fault.directorySyncs += 1
          if (fault.directorySyncs === fault.directoryFailAt) {
            if (fault.directoryAfter) await syncDirectory()
            throw new Error('injected directory sync failure')
          }
          return syncDirectory()
        })
      }
      if (typeof args[0] === 'string' && args[0].includes('/journal.recovery-')) {
        const closeEvidence = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          if (fault.evidenceClose) {
            fault.forceEvidenceClose = closeEvidence
            throw new Error('injected recovery evidence close uncertainty')
          }
          return closeEvidence()
        })
      }
      if (args[0] !== fault.journal) return handle
      const closeJournal = handle.close.bind(handle)
      fault.forceHeldJournalClose = closeJournal
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        if (fault.journalClose) {
          fault.forceJournalClose = closeJournal
          throw new Error('injected journal close uncertainty')
        }
        return closeJournal()
      })
      const write = handle.write.bind(handle) as unknown as BufferWrite
      const sync = handle.sync.bind(handle)
      const writeSpy = vi.spyOn(handle, 'write') as unknown as Readonly<{
        mockImplementation(implementation: BufferWrite): void
      }>
      writeSpy.mockImplementation(async (buffer, offset, length, position) => {
        if (!fault.armed) return write(buffer, offset, length, position)
        fault.writes += 1
        if (fault.mode === 'write-before' && !fault.failed) {
          fault.failed = true
          throw new Error('injected failure before write progress')
        }
        if (fault.mode === 'partial-write' && !fault.failed) {
          fault.failed = true
          await write(buffer, offset, Math.max(1, Math.floor(length / 2)), position)
          throw new Error('injected partial write')
        }
        const allowed = fault.mode === 'short-write' ? Math.min(length, 7) : length
        return write(buffer, offset, allowed, position)
      })
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        if (
          fault.armed &&
          (fault.mode === 'sync' || fault.mode === 'sync-after') &&
          !fault.failed
        ) {
          fault.failed = true
          if (fault.mode === 'sync-after') await sync()
          throw new Error('injected sync failure after complete line')
        }
        return sync()
      })
      return handle
    },
  }
})

import { createJsonlProvider } from '../dist/index.js'

const context = Object.freeze({}) as DiagnosticContext
const require = createRequire(import.meta.url)
const fsExt = require('fs-ext') as {
  flock(
    descriptor: number,
    flags: 'exnb' | 'un',
    callback: (error: NodeJS.ErrnoException | null) => void,
  ): void
}

function diagnostics(logThrows = false, codes?: string[]): Diagnostics {
  return {
    newId: () => 'diagnostic-fault',
    scope: () => context,
    current: () => null,
    log: (_context, point) => {
      codes?.push(point.code)
      if (logThrows) throw new Error('injected diagnostics failure')
    },
    startSpan: () => ({ context, end: () => undefined }),
    within: (_context, body) => body(),
  }
}

function childMessage(child: ReturnType<typeof fork>): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, rejectMessage) => {
    const onMessage = (message: unknown) => {
      cleanup()
      resolveMessage(message as Record<string, unknown>)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      rejectMessage(new Error(`child exited before message: code=${code} signal=${signal}`))
    }
    const cleanup = () => {
      child.off('message', onMessage)
      child.off('exit', onExit)
    }
    child.once('message', onMessage)
    child.once('exit', onExit)
  })
}

function options(directory: string): JsonlProviderOptions {
  return {
    coordinationDomain: 'domain-1',
    directory,
    bindings: [{ namespace: 'core', owners: ['session'], allowSystemScope: false }],
    limits: {
      maxBytes: 16_384,
      maxDepth: 32,
      maxNodes: 1_024,
      maxLineBytes: 32_768,
      maxPayloadBytes: 16_384,
      maxPendingCommits: 4,
      maxPendingBytes: 128_000,
    },
  }
}

function operation(id: string): OperationRef {
  return {
    namespace: 'core',
    principalId: '{"kind":"user","user":{"userId":"user-1"}}',
    operationId: id,
  }
}

function input(id: string): OperationInput {
  return {
    format: 'core-operation/1',
    operationKind: 'session.edit',
    tenantId: 'tenant-1',
    principal: { kind: 'user', user: { userId: 'user-1' } },
    target: { sessionId: 'session-1' },
    arguments: { id },
    preconditions: {},
    causality: {},
  }
}

function prepare(writer: RecordWriter, id: string, expectedRevision = '0'): PreparedCommit {
  const preparedOperation = writer.prepareOperation(operation(id), input(id))
  if (!preparedOperation.ok) throw new Error('operation preparation failed')
  const prepared = writer.prepare({
    operation: preparedOperation.value,
    appends: [
      {
        stream: {
          namespace: 'core',
          owner: 'session',
          scope: { kind: 'tenant', tenantId: 'tenant-1' },
          streamId: 'session-1',
        },
        expectedRevision,
        records: [{ kind: 'session.changed', version: '1', data: { id } }],
      },
    ],
    result: { id },
    requiredUses: [],
  })
  if (!prepared.ok) throw new Error('commit preparation failed')
  return prepared.value
}

afterEach(() => {
  fault.journal = ''
  fault.armed = false
  fault.mode = 'none'
  fault.writes = 0
  fault.failed = false
  fault.lockClose = false
  fault.lockCloseSentinel = false
  fault.lockCloseSentinelFailed = false
  fault.forceClose = null
  fault.journalClose = false
  fault.forceJournalClose = null
  fault.forceHeldJournalClose = null
  fault.forceHeldLockClose = null
  fault.evidenceClose = false
  fault.forceEvidenceClose = null
  fault.directory = ''
  fault.directorySyncs = 0
  fault.directoryFailAt = 0
  fault.directoryAfter = false
})

describe('JSONL durability failure boundaries', () => {
  it('does no journal I/O in commit, loops over short writes, and ignores diagnostic failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-short-write-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(
        options(directory),
        diagnostics(true),
      ).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const prepared = prepare(acquired.writer, 'short-write')
      fault.mode = 'short-write'
      fault.armed = true
      const submission = acquired.writer.commit(prepared)
      expect(submission.status).toBe('pending_durability')
      expect(fault.writes).toBe(0)
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({ status: 'committed' })
      expect(fault.writes).toBeGreaterThan(1)
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('drains an accepted write before releasing the lock and rejects an old writer submission', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-close-drain-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const accepted = prepare(acquired.writer, 'close-accepted', '0')
      const tooLate = prepare(acquired.writer, 'close-too-late', '1')
      fault.mode = 'short-write'
      fault.armed = true
      const submission = acquired.writer.commit(accepted)
      expect(submission.status).toBe('pending_durability')
      const closing = acquired.writer.closeWriter()
      expect(acquired.writer.commit(tooLate)).toMatchObject({ status: 'unavailable' })
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({ status: 'committed' })
      await expect(closing).resolves.toMatchObject({ status: 'closed', watermark: { seq: '2' } })
      expect(acquired.writer.commit(accepted)).toMatchObject({ status: 'unavailable' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('quarantines a partial write, preserves it, repairs only the tail, and proves the miss', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-partial-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const provider = createJsonlProvider(options(directory), diagnostics(true))
      const acquired = await provider.acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const prepared = prepare(acquired.writer, 'partial')
      fault.mode = 'partial-write'
      fault.armed = true
      const submission = acquired.writer.commit(prepared)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({
        status: 'unknown',
        operation: operation('partial'),
        diagnosticId: 'diagnostic-fault',
      })
      const damaged = await readFile(fault.journal)
      expect(damaged.at(-1)).not.toBe(0x0a)
      await expect(acquired.writer.closeWriter()).resolves.toMatchObject({
        status: 'blocked',
        lockHeld: false,
      })

      fault.armed = false
      fault.mode = 'none'
      fault.failed = false
      const reopened = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(reopened.writer.writerEpoch).toBe('2')
      await expect(reopened.writer.lookupOperation(operation('partial'))).resolves.toMatchObject({
        status: 'not_committed',
        verifiedThrough: { seq: '2' },
      })
      const evidence = (await readdir(directory)).filter(name =>
        name.startsWith('journal.recovery-'),
      )
      expect(evidence).toHaveLength(1)
      expect(await readFile(join(directory, evidence[0]!))).toEqual(damaged)
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('returns unknown before write progress and proves not-committed only after recovery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-write-before-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(
        options(directory),
        diagnostics(true),
      ).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const prepared = prepare(acquired.writer, 'write-before')
      fault.mode = 'write-before'
      fault.armed = true
      const submission = acquired.writer.commit(prepared)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({
        status: 'unknown',
        operation: operation('write-before'),
      })
      await expect(acquired.writer.closeWriter()).resolves.toMatchObject({ status: 'blocked' })

      fault.armed = false
      fault.mode = 'none'
      fault.failed = false
      const reopened = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      await expect(
        reopened.writer.lookupOperation(operation('write-before')),
      ).resolves.toMatchObject({ status: 'not_committed', verifiedThrough: { seq: '2' } })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('recovers a valid complete line whose file sync failed before the receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-sync-unknown-'))
    const codes: string[] = []
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(
        options(directory),
        diagnostics(true, codes),
      ).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const prepared = prepare(acquired.writer, 'sync-unknown')
      fault.mode = 'sync'
      fault.armed = true
      const submission = acquired.writer.commit(prepared)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({ status: 'unknown' })
      expect(codes).toContain('journal_durability_unknown')
      expect(codes.every(code => /^[a-z][a-z0-9_.-]{0,127}$/u.test(code))).toBe(true)
      await acquired.writer.closeWriter()

      fault.armed = false
      fault.mode = 'none'
      fault.failed = false
      const reopened = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      await expect(
        reopened.writer.lookupOperation(operation('sync-unknown')),
      ).resolves.toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2', writerEpoch: '1' } },
      })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the original committed result when sync succeeds but its return is lost', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-sync-after-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const prepared = prepare(acquired.writer, 'sync-after')
      fault.mode = 'sync-after'
      fault.armed = true
      const submission = acquired.writer.commit(prepared)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({ status: 'unknown' })
      await acquired.writer.closeWriter()

      fault.armed = false
      fault.mode = 'none'
      fault.failed = false
      const reopened = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      await expect(reopened.writer.lookupOperation(operation('sync-after'))).resolves.toMatchObject(
        {
          status: 'committed',
          receipt: { position: { seq: '2', writerEpoch: '1' } },
        },
      )
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retries namespace durability after a directory sync fails before the epoch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-dir-before-'))
    try {
      fault.directory = directory
      fault.directoryFailAt = 2
      const provider = createJsonlProvider(options(directory), diagnostics())
      await expect(provider.acquireWriter()).resolves.toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'released' },
      })
      expect(fault.directorySyncs).toBe(2)

      fault.directoryFailAt = 0
      const reopened = await provider.acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(reopened.writer.writerEpoch).toBe('1')
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('recognizes the epoch after directory sync completed but its return was lost', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-dir-after-'))
    try {
      fault.directory = directory
      fault.directoryFailAt = 3
      fault.directoryAfter = true
      const provider = createJsonlProvider(options(directory), diagnostics())
      await expect(provider.acquireWriter()).resolves.toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'released' },
      })
      expect(fault.directorySyncs).toBe(3)

      fault.directoryFailAt = 0
      fault.directoryAfter = false
      const reopened = await provider.acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(reopened.writer.writerEpoch).toBe('2')
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not write or acknowledge a queued position past a partial-write gap', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-no-gap-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const firstPrepared = prepare(acquired.writer, 'gap-first', '0')
      const secondPrepared = prepare(acquired.writer, 'gap-second', '1')
      fault.mode = 'partial-write'
      fault.armed = true
      const first = acquired.writer.commit(firstPrepared)
      const second = acquired.writer.commit(secondPrepared)
      expect(first.status).toBe('pending_durability')
      expect(second.status).toBe('pending_durability')
      if (first.status !== 'pending_durability' || second.status !== 'pending_durability') return
      await expect(first.completion).resolves.toMatchObject({ status: 'unknown' })
      await expect(second.completion).resolves.toMatchObject({ status: 'unknown' })
      expect(fault.writes).toBe(1)
      await acquired.writer.closeWriter()

      fault.armed = false
      fault.mode = 'none'
      fault.failed = false
      const reopened = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      await expect(reopened.writer.lookupOperation(operation('gap-first'))).resolves.toMatchObject({
        status: 'not_committed',
      })
      await expect(reopened.writer.lookupOperation(operation('gap-second'))).resolves.toMatchObject(
        {
          status: 'not_committed',
        },
      )
      const text = await readFile(fault.journal, 'utf8')
      expect(text).not.toContain('gap-first')
      expect(text).not.toContain('gap-second')
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses a complete corrupt line without truncating it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-corrupt-line-'))
    try {
      const first = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(first.status).toBe('acquired')
      if (first.status !== 'acquired') return
      expect((await first.writer.closeWriter()).status).toBe('closed')
      const journal = join(directory, 'journal.jsonl')
      await appendFile(journal, '{"complete":"but-invalid"}\n')
      const damaged = await readFile(journal)

      const failed = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(failed).toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'released' },
      })
      expect(await readFile(journal)).toEqual(damaged)
      expect((await readdir(directory)).some(name => name.startsWith('journal.recovery-'))).toBe(
        false,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains one acquisition cleanup when release becomes uncertain', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-cleanup-'))
    try {
      await appendFile(join(directory, 'journal.jsonl'), '{"complete":"invalid"}\n')
      fault.lockClose = true
      const provider = createJsonlProvider(options(directory), diagnostics())
      const failed = await provider.acquireWriter()
      expect(failed.status).toBe('unavailable')
      if (failed.status !== 'unavailable' || failed.cleanup.status !== 'retained') return
      const owner = failed.cleanup.owner
      expect(owner.inspect()).toMatchObject({
        phase: 'retained',
        lock: 'released',
      })
      const retried = await owner.retryRelease()
      expect(retried).toMatchObject({
        cleanupId: owner.cleanupId,
        phase: 'retained',
        lock: 'released',
      })
      const repeatedAcquire = await provider.acquireWriter()
      expect(repeatedAcquire.status).toBe('unavailable')
      if (repeatedAcquire.status === 'unavailable') {
        expect(repeatedAcquire.cleanup).toEqual({ status: 'retained', owner })
      }
    } finally {
      await fault.forceClose?.().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not wash an unknown real lock into released through FileHandle close idempotence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-lock-close-sentinel-'))
    let child: ReturnType<typeof fork> | null = null
    const actualFlock = fsExt.flock.bind(fsExt)
    const flockSpy = vi.spyOn(fsExt, 'flock').mockImplementation((descriptor, flags, callback) => {
      if (flags === 'un') {
        const error = Object.assign(new Error('injected unlock failure'), { code: 'EIO' })
        callback(error)
        return
      }
      actualFlock(descriptor, flags, callback)
    })
    try {
      await appendFile(join(directory, 'journal.jsonl'), '{"complete":"invalid"}\n')
      fault.lockCloseSentinel = true
      const provider = createJsonlProvider(options(directory), diagnostics())
      const failed = await provider.acquireWriter()
      expect(failed.status).toBe('unavailable')
      if (failed.status !== 'unavailable' || failed.cleanup.status !== 'retained') return
      const owner = failed.cleanup.owner
      expect(owner.inspect()).toMatchObject({ phase: 'retained', lock: 'unknown' })
      const retried = await owner.retryRelease()

      child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      const contender = await childMessage(child)
      expect({ cleanupId: retried.cleanupId, lock: retried.lock, contender }).toEqual({
        cleanupId: owner.cleanupId,
        lock: 'unknown',
        contender: { status: 'busy' },
      })
    } finally {
      flockSpy.mockRestore()
      fault.lockCloseSentinel = false
      await fault.forceClose?.().catch(() => undefined)
      if (
        child !== null &&
        child.exitCode === null &&
        child.signalCode === null &&
        child.pid !== undefined
      ) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          // The child may have exited between the status check and signal.
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports close blocked while an unlock succeeds but descriptor close is uncertain', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-close-unknown-'))
    let child: ReturnType<typeof fork> | null = null
    try {
      const acquired = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      fault.lockClose = true
      const firstClose = await acquired.writer.closeWriter()
      expect(firstClose).toMatchObject({ status: 'blocked', lockHeld: false })
      await expect(acquired.writer.closeWriter()).resolves.toEqual(firstClose)

      child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      await expect(childMessage(child)).resolves.toEqual({ status: 'acquired', epoch: '2' })
      const closed = childMessage(child)
      child.send('close')
      await expect(closed).resolves.toEqual({ status: 'closed' })
    } finally {
      await fault.forceClose?.().catch(() => undefined)
      if (
        child !== null &&
        child.exitCode === null &&
        child.signalCode === null &&
        child.pid !== undefined
      ) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          // The child may have exited between the status check and signal.
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains the real lock and original resource identity when journal close is uncertain', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-journal-close-unknown-'))
    let child: ReturnType<typeof fork> | null = null
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(options(directory), diagnostics()).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      fault.journalClose = true
      const firstClose = await acquired.writer.closeWriter()
      expect(firstClose).toMatchObject({ status: 'blocked', lockHeld: true })
      await expect(acquired.writer.closeWriter()).resolves.toBe(firstClose)

      child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      await expect(childMessage(child)).resolves.toEqual({ status: 'busy' })
    } finally {
      fault.journalClose = false
      await fault.forceJournalClose?.().catch(() => undefined)
      await fault.forceHeldLockClose?.().catch(() => undefined)
      if (
        child !== null &&
        child.exitCode === null &&
        child.signalCode === null &&
        child.pid !== undefined
      ) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          // The child may have exited between the status check and signal.
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains recovery evidence ownership and the real lock when its close is uncertain', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-evidence-close-unknown-'))
    let child: ReturnType<typeof fork> | null = null
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const initialized = await createJsonlProvider(
        options(directory),
        diagnostics(),
      ).acquireWriter()
      expect(initialized.status).toBe('acquired')
      if (initialized.status !== 'acquired') return
      expect((await initialized.writer.closeWriter()).status).toBe('closed')
      await appendFile(fault.journal, '{"unfinished"')

      fault.evidenceClose = true
      const provider = createJsonlProvider(options(directory), diagnostics())
      const failed = await provider.acquireWriter()
      expect(failed.status).toBe('unavailable')
      if (failed.status !== 'unavailable' || failed.cleanup.status !== 'retained') return
      const owner = failed.cleanup.owner
      expect(owner.inspect()).toMatchObject({ phase: 'retained', lock: 'held' })
      await expect(owner.retryRelease()).resolves.toMatchObject({
        cleanupId: owner.cleanupId,
        phase: 'retained',
        lock: 'held',
      })
      await expect(provider.acquireWriter()).resolves.toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'retained', owner },
      })

      child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      await expect(childMessage(child)).resolves.toEqual({ status: 'busy' })
    } finally {
      fault.evidenceClose = false
      await fault.forceEvidenceClose?.().catch(() => undefined)
      await fault.forceHeldJournalClose?.().catch(() => undefined)
      await fault.forceHeldLockClose?.().catch(() => undefined)
      if (
        child !== null &&
        child.exitCode === null &&
        child.signalCode === null &&
        child.pid !== undefined
      ) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          // The child may have exited between the status check and signal.
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  })
})
