import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAdmissionCoordinator } from '@omne-harness-lite/admission'
import type { OwnerPublication } from '@omne-harness-lite/admission'
import { createLocalDiagnosticsDirectory } from '@omne-harness-lite/diagnostics'
import { createJsonlProvider } from '@omne-harness-lite/jsonl'
import type { JsonlProviderOptions } from '@omne-harness-lite/records'
import type { OperationRef } from '@omne-harness-lite/work-data'

const root = join(tmpdir(), `omne-storage-admission-consumer-${process.pid}`)
const records = join(root, 'records')
const diagnosticsDirectory = join(root, 'diagnostics')
const operation: OperationRef = {
  namespace: 'core',
  principalId: '{"kind":"user","user":{"userId":"artifact-user"}}',
  operationId: 'artifact-operation',
}
const options: JsonlProviderOptions = {
  coordinationDomain: 'artifact-domain',
  directory: records,
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

try {
  await mkdir(records, { recursive: true })
  const directoryResult = await createLocalDiagnosticsDirectory({
    directory: diagnosticsDirectory,
    maxDirectoryBytes: 512 * 1_024,
    maxFiles: 4,
  })
  assert.equal(directoryResult.status, 'created')
  if (directoryResult.status !== 'created') throw new Error('diagnostics directory not created')
  const sourceResult = await directoryResult.owner.create({
    instanceId: 'artifact-instance',
    sourceId: 'artifact-source',
    level: 'debug',
    maxRecordBytes: 8 * 1_024,
    maxActiveSpans: 8,
    maxBufferBytes: 64 * 1_024,
    maxFileBytes: 256 * 1_024,
  })
  assert.equal(sourceResult.status, 'created')
  if (sourceResult.status !== 'created') throw new Error('diagnostics source not created')
  const diagnostics = sourceResult.runtime
  const provider = createJsonlProvider(options, diagnostics.diagnostics)
  const acquired = await provider.acquireWriter()
  assert.equal(acquired.status, 'acquired')
  if (acquired.status !== 'acquired') throw new Error('writer not acquired')
  const host = createAdmissionCoordinator(acquired.writer, diagnostics.diagnostics)
  const preparedOperation = host.coordinator.prepareOperation(operation, {
    format: 'core-operation/1',
    operationKind: 'artifact.change',
    tenantId: 'artifact-tenant',
    principal: { kind: 'user', user: { userId: 'artifact-user' } },
    target: { resourceId: 'artifact-resource' },
    arguments: { value: 'packed' },
    preconditions: {},
    causality: {
      session: { tenantId: 'artifact-tenant', sessionId: 'artifact-session' },
    },
  })
  assert.equal(preparedOperation.ok, true)
  if (!preparedOperation.ok) throw new Error('operation preparation failed')
  const preparedCommit = host.coordinator.prepare({
    operation: preparedOperation.value,
    appends: [
      {
        stream: {
          namespace: 'core',
          owner: 'session',
          scope: { kind: 'tenant', tenantId: 'artifact-tenant' },
          streamId: 'artifact-session',
        },
        expectedRevision: '0',
        records: [{ kind: 'artifact.changed', version: '1', data: { value: 'packed' } }],
      },
    ],
    result: { value: 'packed-result' },
    requiredUses: [],
  })
  assert.equal(preparedCommit.ok, true)
  if (!preparedCommit.ok) throw new Error('commit preparation failed')
  const publicationOrder: string[] = []
  const publication: OwnerPublication = {
    owner: 'session',
    publishLogical: position => {
      publicationOrder.push(`logical:${position.seq}`)
      return undefined
    },
    publishDurable: receipt => {
      publicationOrder.push(`durable:${receipt.position.seq}`)
      return undefined
    },
  }
  const submission = host.coordinator.enter(frame =>
    host.coordinator.submit(frame, {
      composition: 'owner_change',
      commit: preparedCommit.value,
      publications: [publication],
      uses: [],
    }),
  )
  assert.equal(submission.status, 'pending_durability')
  if (submission.status !== 'pending_durability') throw new Error('submission not pending')
  assert.deepEqual(publicationOrder, ['logical:2'])
  const completion = await submission.completion
  assert.equal(completion.status, 'committed')
  if (completion.status !== 'committed') throw new Error('submission not committed')
  assert.equal(completion.publication, 'ready')
  assert.deepEqual(publicationOrder, ['logical:2', 'durable:2'])
  assert.deepEqual(host.coordinator.status(), {
    phase: 'open',
    logical: { coordinationDomain: 'artifact-domain', seq: '2', commitId: 'commit-2' },
    durable: { coordinationDomain: 'artifact-domain', seq: '2', commitId: 'commit-2' },
  })
  const firstEpoch = acquired.writer.writerEpoch
  const close = await host.coordinator.close()
  assert.equal(close.status, 'closed')

  const reopened = await provider.acquireWriter()
  assert.equal(reopened.status, 'acquired')
  if (reopened.status !== 'acquired') throw new Error('writer not reacquired')
  assert.ok(BigInt(reopened.writer.writerEpoch) > BigInt(firstEpoch))
  const recognized = await reopened.writer.lookupOperation(operation)
  assert.equal(recognized.status, 'committed')
  if (recognized.status !== 'committed') throw new Error('operation not recognized')
  assert.equal(recognized.receipt.outcome.status, 'committed')
  assert.equal(JSON.stringify(recognized.receipt.outcome.result), '{"value":"packed-result"}')
  assert.equal((await reopened.writer.closeWriter()).status, 'closed')
  assert.equal((await diagnostics.close({ deadlineMs: 1_000 })).status, 'closed')
  assert.equal((await directoryResult.owner.close({ deadlineMs: 1_000 })).status, 'closed')

  const diagnosticFiles = (await readdir(diagnosticsDirectory)).filter(name =>
    name.startsWith('diagnostic-'),
  )
  const points = (
    await Promise.all(
      diagnosticFiles.map(async name =>
        (await readFile(join(diagnosticsDirectory, name), 'utf8'))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as Record<string, unknown>),
      ),
    )
  ).flat()
  assert.ok(
    points.some(
      point =>
        point['component'] === 'storage.jsonl' &&
        point['phase'] === 'durability' &&
        point['code'] === 'commit_durable',
    ),
  )
  assert.ok(
    !points.some(
      point =>
        point['kind'] === 'gap' &&
        Array.isArray(point['gaps']) &&
        point['gaps'].some(
          gap =>
            typeof gap === 'object' &&
            gap !== null &&
            'reason' in gap &&
            gap.reason === 'invalid_projection',
        ),
    ),
  )
  console.log(
    JSON.stringify({
      status: 'PASS',
      firstEpoch,
      reopenedEpoch: reopened.writer.writerEpoch,
      committedSeq: recognized.receipt.position.seq,
      publicationOrder,
      diagnosticCodes: points.map(point => point['code']).filter(Boolean),
    }),
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
