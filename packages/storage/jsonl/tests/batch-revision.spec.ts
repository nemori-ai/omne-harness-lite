import { createHash } from 'node:crypto'
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiagnosticContext, Diagnostics } from '@omne-harness-lite/diagnostics'
import { encodeEnvelope } from '@omne-harness-lite/records'
import type {
  CommitEnvelope,
  CommitRequest,
  JsonlProviderOptions,
  OperationInput,
  PreparedCommit,
  RecordWriter,
  StreamAppend,
  StreamRef,
} from '@omne-harness-lite/records'
import { canonicalJson } from '@omne-harness-lite/work-data'
import type { JsonValue, OperationRef } from '@omne-harness-lite/work-data'
import { describe, expect, it } from 'vitest'
import { createJsonlProvider } from '../dist/index.js'

const context = Object.freeze({}) as DiagnosticContext
const diagnostics: Diagnostics = {
  newId: () => 'batch-revision-diagnostic',
  scope: () => context,
  current: () => null,
  log: () => undefined,
  startSpan: () => ({ context, end: () => undefined }),
  within: (_context, body) => body(),
}

const sessionStream: StreamRef = Object.freeze({
  namespace: 'core',
  owner: 'session',
  scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
  streamId: 'session-1',
})

const approvalStream: StreamRef = Object.freeze({
  namespace: 'core',
  owner: 'approval',
  scope: { kind: 'tenant' as const, tenantId: 'tenant-1' },
  streamId: 'approval-1',
})

const epochStream: StreamRef = Object.freeze({
  namespace: 'core.writer',
  owner: 'durable-records',
  scope: { kind: 'system' as const },
  streamId: 'writer-epochs',
})

function options(directory: string): JsonlProviderOptions {
  return {
    coordinationDomain: 'batch-revision-domain',
    directory,
    bindings: [{ namespace: 'core', owners: ['approval', 'session'], allowSystemScope: false }],
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
    operationKind: 'session.change',
    tenantId: 'tenant-1',
    principal: { kind: 'user', user: { userId: 'user-1' } },
    target: { sessionId: 'session-1' },
    arguments: { id },
    preconditions: {},
    causality: {},
  }
}

function records(count: number, prefix: string): StreamAppend['records'] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        kind: 'session.changed',
        version: '1',
        data: Object.freeze({ id: `${prefix}-${index + 1}` }),
      }),
    ),
  )
}

function prepare(
  writer: RecordWriter,
  ref: OperationRef,
  operationInput: OperationInput,
  appends: readonly StreamAppend[],
  result: CommitRequest['result'],
): PreparedCommit {
  const preparedOperation = writer.prepareOperation(ref, operationInput)
  if (!preparedOperation.ok) throw new Error('operation preparation failed')
  const prepared = writer.prepare({
    operation: preparedOperation.value,
    appends,
    result,
    requiredUses: [],
  })
  if (!prepared.ok) throw new Error('commit preparation failed')
  return prepared.value
}

function legacyEnvelope(
  seq: '2' | '3',
  id: string,
  expectedRevision: string,
  recordCount: number,
): CommitEnvelope {
  const operationInput = input(id)
  const canonicalInput = canonicalJson(operationInput as unknown as JsonValue)
  return {
    formatVersion: 'core-journal/1',
    position: {
      coordinationDomain: 'batch-revision-domain',
      writerEpoch: '1',
      commitId: `legacy-${seq}`,
      seq,
    },
    operation: operation(id),
    inputEncoding: 'core-json/1',
    canonicalInput,
    inputDigest: createHash('sha256').update(canonicalInput, 'utf8').digest('hex'),
    appends: [
      {
        stream: sessionStream,
        expectedRevision,
        records: records(recordCount, id),
      },
    ],
    outcome: { status: 'committed', result: { id } },
    requiredUses: [],
  }
}

function encode(envelope: CommitEnvelope, configured: JsonlProviderOptions): Uint8Array {
  const encoded = encodeEnvelope(envelope, configured.limits)
  if (!encoded.ok) throw new Error(`fixture encoding failed: ${encoded.issues[0]?.message}`)
  return encoded.value
}

describe('one stream revision per committed batch', () => {
  it('assigns +1 before I/O, replays one pending result, and recovers exact receipts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-batch-revision-'))
    try {
      const configured = options(directory)
      const acquired = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const firstRef = operation('two-record-first')
      const firstInput = input('two-record-first')
      const first = prepare(
        acquired.writer,
        firstRef,
        firstInput,
        [
          {
            stream: sessionStream,
            expectedRevision: '0',
            records: records(2, 'first'),
          },
        ],
        { value: 'first' },
      )
      const changedProposal = prepare(
        acquired.writer,
        firstRef,
        firstInput,
        [
          {
            stream: sessionStream,
            expectedRevision: '99',
            records: records(1, 'ignored'),
          },
        ],
        { value: 'ignored' },
      )
      const secondRef = operation('one-record-second')
      const second = prepare(
        acquired.writer,
        secondRef,
        input('one-record-second'),
        [
          {
            stream: sessionStream,
            expectedRevision: '1',
            records: records(1, 'second'),
          },
        ],
        { value: 'second' },
      )

      const firstSubmission = acquired.writer.commit(first)
      expect(firstSubmission.status).toBe('pending_durability')
      if (firstSubmission.status !== 'pending_durability') return
      expect(acquired.writer.commit(changedProposal)).toBe(firstSubmission)
      const secondSubmission = acquired.writer.commit(second)
      expect(secondSubmission).toMatchObject({
        status: 'pending_durability',
        disposition: 'apply',
        position: { seq: '3' },
      })
      if (secondSubmission.status !== 'pending_durability') return
      await expect(acquired.writer.readHead([sessionStream])).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '0' }], watermark: { seq: '1' } },
      })

      const firstResult = await firstSubmission.completion
      expect(firstResult).toMatchObject({
        status: 'committed',
        receipt: { streams: [{ stream: sessionStream, revision: '1' }] },
      })
      await expect(secondSubmission.completion).resolves.toMatchObject({
        status: 'committed',
        receipt: { streams: [{ stream: sessionStream, revision: '2' }] },
      })
      expect(acquired.writer.commit(changedProposal)).toBe(firstResult)
      await expect(acquired.writer.readHead([sessionStream])).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '2' }], watermark: { seq: '3' } },
      })
      expect((await acquired.writer.closeWriter()).status).toBe('closed')

      const reopened = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(reopened.writer.writerEpoch).toBe('2')
      await expect(reopened.writer.lookupOperation(firstRef)).resolves.toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2' }, streams: [{ revision: '1' }] },
      })
      await expect(reopened.writer.lookupOperation(secondRef)).resolves.toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '3' }, streams: [{ revision: '2' }] },
      })
      await expect(reopened.writer.readHead([sessionStream, epochStream])).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '2' }, { revision: '2' }] },
      })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('advances every touched stream once and leaves all business streams unchanged on conflict', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-multi-batch-revision-'))
    try {
      const configured = options(directory)
      const acquired = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(acquired.status).toBe('acquired')
      if (acquired.status !== 'acquired') return
      const applied = prepare(
        acquired.writer,
        operation('multi-stream-many-records'),
        input('multi-stream-many-records'),
        [
          {
            stream: approvalStream,
            expectedRevision: '0',
            records: records(2, 'approval'),
          },
          {
            stream: sessionStream,
            expectedRevision: '0',
            records: records(3, 'session'),
          },
        ],
        { value: 'multi' },
      )
      const appliedSubmission = acquired.writer.commit(applied)
      expect(appliedSubmission.status).toBe('pending_durability')
      if (appliedSubmission.status !== 'pending_durability') return
      await expect(appliedSubmission.completion).resolves.toMatchObject({
        status: 'committed',
        receipt: {
          streams: [
            { stream: approvalStream, revision: '1' },
            { stream: sessionStream, revision: '1' },
          ],
        },
      })

      const conflictRef = operation('multi-stream-conflict')
      const conflict = prepare(
        acquired.writer,
        conflictRef,
        input('multi-stream-conflict'),
        [
          {
            stream: approvalStream,
            expectedRevision: '1',
            records: records(2, 'would-apply-a'),
          },
          {
            stream: sessionStream,
            expectedRevision: '0',
            records: records(3, 'would-apply-b'),
          },
        ],
        { value: 'not-applied' },
      )
      const conflictSubmission = acquired.writer.commit(conflict)
      expect(conflictSubmission).toMatchObject({
        status: 'pending_durability',
        disposition: 'record_conflict',
      })
      if (conflictSubmission.status !== 'pending_durability') return
      const conflictResult = await conflictSubmission.completion
      expect(conflictResult).toMatchObject({
        status: 'conflict',
        conflict: { currents: [{ stream: sessionStream, revision: '1' }] },
        receipt: {
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
      expect(acquired.writer.commit(conflict)).toBe(conflictResult)
      await expect(
        acquired.writer.readHead([approvalStream, sessionStream]),
      ).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '1' }, { revision: '1' }] },
      })
      expect((await acquired.writer.closeWriter()).status).toBe('closed')

      const reopened = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      await expect(reopened.writer.lookupOperation(conflictRef)).resolves.toMatchObject(
        conflictResult,
      )
      await expect(
        reopened.writer.readHead([approvalStream, sessionStream]),
      ).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '1' }, { revision: '1' }] },
      })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('recognizes one complete unacknowledged multi-record batch with revision one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-unack-batch-revision-'))
    try {
      const configured = options(directory)
      const initialized = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(initialized.status).toBe('acquired')
      if (initialized.status !== 'acquired') return
      expect((await initialized.writer.closeWriter()).status).toBe('closed')
      await appendFile(
        join(directory, 'journal.jsonl'),
        encode(legacyEnvelope('2', 'unacknowledged-multi', '0', 2), configured),
      )

      const reopened = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(reopened.writer.writerEpoch).toBe('2')
      await expect(
        reopened.writer.lookupOperation(operation('unacknowledged-multi')),
      ).resolves.toMatchObject({
        status: 'committed',
        receipt: { position: { seq: '2' }, streams: [{ revision: '1' }] },
      })
      await expect(reopened.writer.readHead([sessionStream, epochStream])).resolves.toMatchObject({
        status: 'read',
        value: { streams: [{ revision: '1' }, { revision: '2' }] },
      })
      expect((await reopened.writer.closeWriter()).status).toBe('closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses a complete legacy +N predecessor chain without changing its bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-jsonl-plus-n-chain-'))
    try {
      const configured = options(directory)
      const initialized = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(initialized.status).toBe('acquired')
      if (initialized.status !== 'acquired') return
      expect((await initialized.writer.closeWriter()).status).toBe('closed')
      const journal = join(directory, 'journal.jsonl')
      await appendFile(
        journal,
        Buffer.concat([
          encode(legacyEnvelope('2', 'legacy-multi', '0', 2), configured),
          encode(legacyEnvelope('3', 'legacy-plus-n-successor', '2', 1), configured),
        ]),
      )
      const original = await readFile(journal)

      const failed = await createJsonlProvider(configured, diagnostics).acquireWriter()
      expect(failed).toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'released' },
      })
      expect(await readFile(journal)).toEqual(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
