import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiagnosticContext, Diagnostics, DiagnosticSpan } from '@omne-harness-lite/diagnostics'
import type {
  CommitRequest,
  JsonlProviderOptions,
  OperationInput,
  StreamAppend,
} from '@omne-harness-lite/records'
import type { OperationRef } from '@omne-harness-lite/work-data'
import { describe, expect, it } from 'vitest'
import { createJsonlProvider } from '../dist/index.js'

const context = Object.freeze({}) as DiagnosticContext
const diagnostics: Diagnostics = {
  newId: () => 'diagnostic-test',
  scope: () => context,
  current: () => null,
  log: () => undefined,
  startSpan: (): DiagnosticSpan => ({ context, end: () => undefined }),
  within: (_context, body) => body(),
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
      maxPendingCommits: 8,
      maxPendingBytes: 128_000,
    },
  }
}

const operation: OperationRef = {
  namespace: 'core',
  principalId: '{"kind":"user","user":{"userId":"user-1"}}',
  operationId: 'operation-1',
}

const input: OperationInput = {
  format: 'core-operation/1',
  operationKind: 'session.create',
  tenantId: 'tenant-1',
  principal: { kind: 'user', user: { userId: 'user-1' } },
  target: { sessionId: 'session-1' },
  arguments: { title: 'first' },
  preconditions: {},
  causality: {},
}

describe('durable JSONL provider', () => {
  it('emits diagnostics with D1 semantic codes at acquire and durable commit boundaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-diagnostics-'))
    const codes: string[] = []
    const recording: Diagnostics = {
      ...diagnostics,
      log: (_context, point) => {
        codes.push(point.code)
      },
    }
    try {
      const acquired = await createJsonlProvider(options(directory), recording).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const preparedOperation = acquired.writer.prepareOperation(
        { ...operation, operationId: 'diagnostic-boundaries' },
        input,
      )
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      const prepared = acquired.writer.prepare({
        operation: preparedOperation.value,
        appends: [
          {
            stream: {
              namespace: 'core',
              owner: 'session',
              scope: { kind: 'tenant', tenantId: 'tenant-1' },
              streamId: 'diagnostic-session',
            },
            expectedRevision: '0',
            records: [{ kind: 'session.created', version: '1', data: {} }],
          },
        ],
        result: {},
        requiredUses: [],
      })
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const submission = acquired.writer.commit(prepared.value)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({ status: 'committed' })
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
      expect(codes).toEqual(['writer_acquired', 'commit_durable'])
      expect(codes.every(code => /^[a-z][a-z0-9_.-]{0,127}$/u.test(code))).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('acquires an epoch, persists one commit, deduplicates it, and recovers it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-provider-'))
    try {
      const provider = createJsonlProvider(options(directory), diagnostics)
      const acquired = await provider.acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      expect(acquired.writer.writerEpoch).toBe('1')
      expect(acquired.recovered.seq).toBe('1')

      const preparedOperation = acquired.writer.prepareOperation(operation, input)
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      const request: CommitRequest = {
        operation: preparedOperation.value,
        appends: [
          {
            stream: {
              namespace: 'core',
              owner: 'session',
              scope: { kind: 'tenant', tenantId: 'tenant-1' },
              streamId: 'session-1',
            },
            expectedRevision: '0',
            records: [{ kind: 'session.created', version: '1', data: { title: 'first' } }],
          },
        ],
        result: { sessionId: 'session-1' },
        requiredUses: [],
      }
      const prepared = acquired.writer.prepare(request)
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const submission = acquired.writer.commit(prepared.value)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      expect(submission.position.seq).toBe('2')
      const committed = await submission.completion
      expect(committed.status).toBe('committed')
      expect(acquired.writer.commit(prepared.value)).toEqual(committed)
      expect(await acquired.writer.lookupOperation(operation)).toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2', writerEpoch: '1' } },
      })
      expect((await acquired.writer.closeWriter()).status).toBe('closed')

      const lines = (await readFile(join(directory, 'journal.jsonl'), 'utf8'))
        .split('\n')
        .filter(Boolean)
      expect(lines).toHaveLength(2)
      expect(Buffer.byteLength(`${lines[0]}\n`, 'utf8')).toBe(1294)
      expect(createHash('sha256').update(`${lines[0]}\n`).digest('hex')).toBe(
        '922232e653e4196bcdda9624769766eb65784c624caf2661f38051543917e63a',
      )

      const reopened = createJsonlProvider(options(directory), diagnostics)
      const reacquired = await reopened.acquireWriter()
      expect(reacquired.status).toBe('acquired')
      if (reacquired.status !== 'acquired') return
      expect(reacquired.writer.writerEpoch).toBe('2')
      expect(reacquired.recovered.seq).toBe('3')
      expect(await reacquired.writer.lookupOperation(operation)).toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2', writerEpoch: '1' } },
      })
      expect((await reacquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the first accepted result for equal input and durably records revision conflicts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-conflict-'))
    try {
      const acquired = await createJsonlProvider(options(directory), diagnostics).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const writer = acquired.writer
      const stream = {
        namespace: 'core',
        owner: 'session',
        scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
        streamId: 'session-1',
      }

      const submit = async (
        ref: OperationRef,
        operationInput: OperationInput,
        expectedRevision: string,
        records: StreamAppend['records'],
        result: CommitRequest['result'],
      ) => {
        const preparedOperation = writer.prepareOperation(ref, operationInput)
        expect(preparedOperation.ok).toBe(true)
        if (!preparedOperation.ok) throw new Error('test preparation failed')
        const prepared = writer.prepare({
          operation: preparedOperation.value,
          appends: [{ stream, expectedRevision, records }],
          result,
          requiredUses: [],
        })
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) throw new Error('test commit preparation failed')
        return { preparedOperation: preparedOperation.value, prepared: prepared.value }
      }

      const first = await submit(
        operation,
        input,
        '0',
        [{ kind: 'session.created', version: '1', data: { title: 'first' } }],
        { value: 'original' },
      )
      const firstSubmission = writer.commit(first.prepared)
      expect(firstSubmission.status).toBe('pending_durability')
      if (firstSubmission.status !== 'pending_durability') return
      const firstResult = await firstSubmission.completion
      expect(firstResult).toMatchObject({
        status: 'committed',
        receipt: { outcome: { result: { value: 'original' } } },
      })

      const sameInputChangedBatch = await submit(
        operation,
        input,
        '1',
        [{ kind: 'session.renamed', version: '1', data: { title: 'replacement' } }],
        { value: 'replacement' },
      )
      expect(writer.commit(sameInputChangedBatch.prepared)).toEqual(firstResult)

      const changedInput = await submit(
        operation,
        { ...input, arguments: { title: 'different' } },
        '1',
        [{ kind: 'session.renamed', version: '1', data: { title: 'different' } }],
        { value: 'different' },
      )
      expect(writer.commit(changedInput.prepared)).toMatchObject({
        status: 'conflict',
        conflict: { kind: 'operation_input', operation },
        receipt: null,
      })

      const conflictRef = { ...operation, operationId: 'conflicting-operation' }
      const conflictInput = { ...input, arguments: { title: 'conflict' } }
      const conflicting = await submit(
        conflictRef,
        conflictInput,
        '3',
        [{ kind: 'session.renamed', version: '1', data: { title: 'conflict' } }],
        { value: 'never-applied' },
      )
      const conflictSubmission = writer.commit(conflicting.prepared)
      expect(conflictSubmission.status).toBe('pending_durability')
      if (conflictSubmission.status !== 'pending_durability') return
      expect(conflictSubmission.disposition).toBe('record_conflict')
      const conflictResult = await conflictSubmission.completion
      expect(conflictResult).toMatchObject({
        status: 'conflict',
        conflict: { kind: 'revision', currents: [{ stream, revision: '1' }] },
        receipt: {
          position: { seq: '3' },
          streams: [
            {
              stream: {
                namespace: 'core.records',
                owner: 'durable-records',
                streamId: 'operation-outcomes',
              },
              revision: '1',
            },
          ],
        },
      })

      const advanceRef = { ...operation, operationId: 'advance-operation' }
      const advance = await submit(
        advanceRef,
        { ...input, arguments: { title: 'advance' } },
        '1',
        [
          { kind: 'session.renamed', version: '1', data: { title: 'second' } },
          { kind: 'session.renamed', version: '1', data: { title: 'third' } },
        ],
        { value: 'advanced' },
      )
      const advanceSubmission = writer.commit(advance.prepared)
      expect(advanceSubmission.status).toBe('pending_durability')
      if (advanceSubmission.status !== 'pending_durability') return
      await advanceSubmission.completion
      expect(writer.commit(conflicting.prepared)).toEqual(conflictResult)

      const head = await writer.readHead([stream])
      expect(head).toMatchObject({ status: 'read', value: { streams: [{ revision: '3' }] } })
      if (head.status !== 'read') return
      const range = await writer.readRange({
        afterSeq: '1',
        through: head.value.watermark,
        limit: 10,
      })
      expect(range).toMatchObject({
        status: 'read',
        value: { nextAfterSeq: '4', complete: true },
      })
      if (range.status === 'read') {
        expect(range.value.envelopes.map(envelope => envelope.outcome.status)).toEqual([
          'committed',
          'conflict',
          'committed',
        ])
      }
      expect((await writer.closeWriter()).status).toBe('closed')

      const reopened = await createJsonlProvider(options(directory), diagnostics).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(await reopened.writer.lookupOperation(conflictRef)).toMatchObject({
        status: 'conflict',
        conflict: { currents: [{ revision: '1' }] },
        receipt: { position: { seq: '3' } },
      })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects opaque preparation values issued by a different writer', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'omne-jsonl-token-a-'))
    const secondDirectory = await mkdtemp(join(tmpdir(), 'omne-jsonl-token-b-'))
    try {
      const first = await createJsonlProvider(options(firstDirectory), diagnostics).acquireWriter()
      const second = await createJsonlProvider(
        options(secondDirectory),
        diagnostics,
      ).acquireWriter()
      expect(first.status).toBe('acquired')
      expect(second.status).toBe('acquired')
      if (first.status !== 'acquired' || second.status !== 'acquired') return
      const preparedOperation = first.writer.prepareOperation(operation, input)
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      expect(Object.isFrozen(preparedOperation.value)).toBe(true)
      const prepared = first.writer.prepare({
        operation: preparedOperation.value,
        appends: [
          {
            stream: {
              namespace: 'core',
              owner: 'session',
              scope: { kind: 'tenant', tenantId: 'tenant-1' },
              streamId: 'session-1',
            },
            expectedRevision: '0',
            records: [{ kind: 'session.created', version: '1', data: {} }],
          },
        ],
        result: {},
        requiredUses: [],
      })
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      expect(Object.isFrozen(prepared.value)).toBe(true)
      expect(second.writer.commit(prepared.value)).toMatchObject({
        status: 'rejected',
        reason: { code: 'invalid' },
        receipt: null,
      })
      expect(second.writer.lookupPrepared(preparedOperation.value)).toMatchObject({
        status: 'rejected',
        reason: { code: 'invalid' },
      })
      await Promise.all([first.writer.closeWriter(), second.writer.closeWriter()])
    } finally {
      await Promise.all([
        rm(firstDirectory, { recursive: true, force: true }),
        rm(secondDirectory, { recursive: true, force: true }),
      ])
    }
  })

  it('assigns one position to a canonical multi-stream batch and advances exact revisions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-multi-stream-'))
    try {
      const configured = options(directory)
      const provider = createJsonlProvider(
        {
          ...configured,
          bindings: [
            {
              namespace: 'core',
              owners: ['approval', 'session'],
              allowSystemScope: false,
            },
          ],
        },
        diagnostics,
      )
      const acquired = await provider.acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const preparedOperation = acquired.writer.prepareOperation(
        { ...operation, operationId: 'multi-stream' },
        { ...input, operationKind: 'owner.change', arguments: { owners: 2 } },
      )
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      const approvalStream = {
        namespace: 'core',
        owner: 'approval',
        scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
        streamId: 'approval-1',
      }
      const sessionStream = {
        namespace: 'core',
        owner: 'session',
        scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
        streamId: 'session-1',
      }
      const prepared = acquired.writer.prepare({
        operation: preparedOperation.value,
        appends: [
          {
            stream: approvalStream,
            expectedRevision: '0',
            records: [{ kind: 'approval.owner-changed', version: '1', data: {} }],
          },
          {
            stream: sessionStream,
            expectedRevision: '0',
            records: [{ kind: 'session.owner-changed', version: '1', data: {} }],
          },
        ],
        result: { changed: true },
        requiredUses: [],
      })
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const submission = acquired.writer.commit(prepared.value)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({
        status: 'committed',
        receipt: {
          position: { seq: '2' },
          streams: [
            { stream: approvalStream, revision: '1' },
            { stream: sessionStream, revision: '1' },
          ],
        },
      })
      await expect(
        acquired.writer.readHead([approvalStream, sessionStream]),
      ).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '1' }, { revision: '1' }] },
      })
      expect(
        (await readFile(join(directory, 'journal.jsonl'), 'utf8')).split('\n').filter(Boolean),
      ).toHaveLength(2)
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('persists revision conflicts in codec canonical order without locale collation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-conflict-order-'))
    try {
      const acquired = await createJsonlProvider(options(directory), diagnostics).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const preparedOperation = acquired.writer.prepareOperation(
        { ...operation, operationId: 'canonical-conflict-order' },
        { ...input, arguments: { streams: ['A', 'a'] } },
      )
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      const streams = ['A', 'a'].map(streamId => ({
        namespace: 'core',
        owner: 'session',
        scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
        streamId,
      }))
      const prepared = acquired.writer.prepare({
        operation: preparedOperation.value,
        appends: streams.map(stream => ({
          stream,
          expectedRevision: '1',
          records: [{ kind: 'session.changed', version: '1', data: {} }],
        })),
        result: { applied: false },
        requiredUses: [],
      })
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const submission = acquired.writer.commit(prepared.value)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      await expect(submission.completion).resolves.toMatchObject({
        status: 'conflict',
        conflict: {
          kind: 'revision',
          currents: [
            { stream: streams[0], revision: '0' },
            { stream: streams[1], revision: '0' },
          ],
        },
        receipt: { position: { seq: '2' } },
      })
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the stable flock through SIGSTOP and advances epoch after SIGKILL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-process-lock-'))
    const child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    try {
      await expect(childMessage(child)).resolves.toEqual({ status: 'acquired', epoch: '1' })
      const lockBefore = await stat(join(directory, '.writer.lock'), { bigint: true })
      const contender = createJsonlProvider(options(directory), diagnostics)
      await expect(contender.acquireWriter()).resolves.toEqual({ status: 'busy' })

      if (child.pid === undefined) throw new Error('child process has no pid')
      process.kill(child.pid, 'SIGSTOP')
      await expect(contender.acquireWriter()).resolves.toEqual({ status: 'busy' })
      process.kill(child.pid, 'SIGKILL')
      await new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))

      const acquired = await contender.acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      expect(acquired.writer.writerEpoch).toBe('2')
      const lockAfter = await stat(join(directory, '.writer.lock'), { bigint: true })
      expect(lockAfter.dev).toBe(lockBefore.dev)
      expect(lockAfter.ino).toBe(lockBefore.ino)
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          // The child may have exited between the status check and signal.
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('recognizes a valid line after the writer dies between sync and receipt delivery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-receipt-crash-'))
    const child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [directory], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    try {
      await expect(childMessage(child)).resolves.toEqual({ status: 'acquired', epoch: '1' })
      const pendingMessage = childMessage(child)
      child.send('commit-crash')
      await expect(pendingMessage).resolves.toEqual({ status: 'pending_durability' })
      await new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))
      expect(child.signalCode).toBe('SIGKILL')

      const acquired = await createJsonlProvider(options(directory), diagnostics).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      await expect(
        acquired.writer.lookupOperation({
          namespace: 'core',
          principalId: operation.principalId,
          operationId: 'crash-before-receipt',
        }),
      ).resolves.toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2', writerEpoch: '1' } },
      })
      expect(acquired.writer.writerEpoch).toBe('2')
      expect((await acquired.writer.closeWriter()).status).toBe('closed')
    } finally {
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
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
