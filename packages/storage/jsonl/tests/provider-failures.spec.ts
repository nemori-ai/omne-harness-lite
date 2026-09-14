import { appendFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
  mode: 'none' as 'none' | 'partial-write' | 'short-write' | 'sync',
  writes: 0,
  failed: false,
  lockClose: false,
  forceClose: null as null | (() => Promise<void>),
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
      if (typeof args[0] === 'string' && args[0].endsWith('/.writer.lock') && fault.lockClose) {
        const close = handle.close.bind(handle)
        fault.forceClose = close
        vi.spyOn(handle, 'close').mockRejectedValue(new Error('injected lock close uncertainty'))
      }
      if (args[0] !== fault.journal) return handle
      const write = handle.write.bind(handle) as unknown as BufferWrite
      const sync = handle.sync.bind(handle)
      const writeSpy = vi.spyOn(handle, 'write') as unknown as Readonly<{
        mockImplementation(implementation: BufferWrite): void
      }>
      writeSpy.mockImplementation(async (buffer, offset, length, position) => {
        if (!fault.armed) return write(buffer, offset, length, position)
        fault.writes += 1
        if (fault.mode === 'partial-write' && !fault.failed) {
          fault.failed = true
          await write(buffer, offset, Math.max(1, Math.floor(length / 2)), position)
          throw new Error('injected partial write')
        }
        const allowed = fault.mode === 'short-write' ? Math.min(length, 7) : length
        return write(buffer, offset, allowed, position)
      })
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        if (fault.armed && fault.mode === 'sync' && !fault.failed) {
          fault.failed = true
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

function diagnostics(logThrows = false): Diagnostics {
  return {
    newId: () => 'diagnostic-fault',
    scope: () => context,
    current: () => null,
    log: () => {
      if (logThrows) throw new Error('injected diagnostics failure')
    },
    startSpan: () => ({ context, end: () => undefined }),
    within: (_context, body) => body(),
  }
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
  fault.forceClose = null
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

  it('recovers a valid complete line whose file sync failed before the receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-sync-unknown-'))
    try {
      fault.journal = join(directory, 'journal.jsonl')
      const acquired = await createJsonlProvider(
        options(directory),
        diagnostics(true),
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
})
